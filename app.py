from flask import Flask, request, jsonify, render_template, session
from flask_session import Session
import uuid
import redis
import logging
import json
import re
import time
from google.genai.errors import ServerError
from graph import build_graph
from llm import gemini_flash_fast  # Import the fast model for the translation route
from utils import translate_text
import vector_db
from vector_db import get_similar_que, store_que_pair
import os
from apscheduler.schedulers.background import BackgroundScheduler
from logging_config import setup_logging
from llm_cache import get_cached_answer, store_cached_answer, serialize_safe
from dotenv import load_dotenv
from flask_cors import CORS



load_dotenv()

setup_logging()
logger = logging.getLogger(__name__)

# 1. Load the chitchat dictionary when the app starts
try:
    with open('chitchat.json', 'r') as f:
        CHITCHAT_RESPONSES = json.load(f)
    logger.info("Loaded chitchat rules.")
except FileNotFoundError:
    CHITCHAT_RESPONSES = {}
    logger.warning("chitchat.json not found. Skipping chitchat interception.")

app = Flask(__name__)
CORS(app, resources={r"/chat": {"origins": "*"}, r"/translate": {"origins": "*"}})
# Redis configuration
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY")
app.config["SESSION_TYPE"] = os.getenv("SESSION_TYPE")

app.config["SESSION_REDIS"] = redis.Redis(
    host=os.getenv("REDIS_HOST"),
    port=int(os.getenv("REDIS_PORT"))
)

app.config["SESSION_PERMANENT"] = os.getenv("SESSION_PERMANENT") == "True"
app.config["SESSION_USE_SIGNER"] = os.getenv("SESSION_USE_SIGNER") == "True"
app.config["SESSION_KEY_PREFIX"] = os.getenv("SESSION_KEY_PREFIX")
app.config["PERMANENT_SESSION_LIFETIME"] = int(os.getenv("SESSION_LIFETIME"))

Session(app)

logger.info("Redis session manager started.")

# Initialize the fast model for the standalone translation route
llm_flash = gemini_flash_fast()

# The graph now handles its own internal LLM routing
graph = build_graph()

# Vector database to run in the background every 5 minutes for incremental updates
scheduler = BackgroundScheduler()

scheduler.add_job(
    vector_db.update_vector_index,
    "interval",
    minutes=5,
    max_instances=1
)

scheduler.start()
logger.info("Vector index background updater started.")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/chat", methods=["POST"])
def chat():
    """
    Main chatbot endpoint.
    Handles concurrent users through Redis sessions.
    """
    if "session_id" not in session:
        session["session_id"] = str(uuid.uuid4())
        logger.info(f"[NEW SESSION] {session['session_id']}")

    payload = request.get_json()
    question = payload.get("message", "")

    # 2. CHITCHAT INTERCEPTION LOGIC
    # Normalize the question (lowercase and remove punctuation)
    clean_question = re.sub(r'[^\w\s]', '', question).strip().lower()

    if clean_question in CHITCHAT_RESPONSES:
        logger.info("CHITCHAT INTERCEPT HIT")
        response = {
            "answer": CHITCHAT_RESPONSES[clean_question],
            "graphBase64": None # No graph execution happened
        }
        return jsonify(response)
    
    logger.info(f"[USER QUESTION] {question}")
    
    # Check Redis LLM cache first
    cached = get_cached_answer(question)

    if cached:
        logger.info(f"LLM CACHE HIT: {question}")
        return jsonify(cached)
    
    # Pre-check: Skip semantic cache for questions likely needing visualizations
    viz_keywords = ["graph", "chart", "show", "visualize", "plot", "display", "diagram"]
    is_viz_intent = any(keyword in question.lower() for keyword in viz_keywords)
    
    if not is_viz_intent:
        # Semantic FAISS cache (only for text-intent questions)
        semantic_hit = get_similar_que(question)
    
        if semantic_hit:
            logger.info("[CACHE HIT - FAISS SEMANTIC]")
            return jsonify(semantic_hit)

    logger.info(f"LLM CACHE MISS: {question}")
    
    # Pass thread_id via config, not in the input state
    config = {"configurable": {"thread_id": session["session_id"]}}

    # Safe graph execution
    try:
        for attempt in range(3):
            try:
                result = graph.invoke(
                    {"question": question},
                    config=config
                )
                break
            except ServerError as e:
                logger.warning(f"[503 ERROR] attempt {attempt+1}")
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)

        logger.info("[GRAPH EXECUTION COMPLETE]")

        response = {
            "answer": result.get("answer"),
            "graphBase64": result.get("graph_base64"),
            "graphSvg": result.get("graph_svg"),
            "vizData": result.get("viz_data")
        }
        
        response = serialize_safe(response)
        
        # Skip caching visualization
        is_viz = any([
            response.get("graphBase64"),
            response.get("graphSvg"),
            response.get("vizData")
        ])
        
        # store only valid responses
        if response.get("answer") and not is_viz:
            store_cached_answer(question, response)
            store_que_pair(question, response)
            logger.info("[CACHE STORE - TEXT ONLY, REDIS + FAISS]")
        else:
            logger.info("[SKIP CACHE - VISUALIZATION]")

        return jsonify(response)
    
    except ServerError:
        logger.error("[FINAL 503 FAILURE]")

        return jsonify({
            "answer": "The AI service is currently experiencing high demand. Please try again shortly.",
            "graphBase64": None
        }), 200

    except Exception as e:
        logger.exception("[UNEXPECTED ERROR]")

        return jsonify({
            "answer": "Something went wrong on the server. Please try again later.",
            "graphBase64": None
        }), 200

# health check
@app.route("/health")
def health():
    return {"status": "running"}
    
# Translation route
@app.route("/translate", methods=["POST"])
def translate():
    """
    Translates en to ar and vice versa
    """
    text = request.json.get("text")
    target_lang = request.json.get("target_lang")
    if not text:
        return jsonify({"error": "No text provided"}), 400
    
    # Use the fast, cost-efficient model for standalone translations
    translated, source_lang = translate_text(text, llm_flash, target_lang=target_lang)    
    return jsonify({
        "translation": translated,
        "source_lang": source_lang
    })

if __name__ == "__main__":
    print("Loading vector database...")

    vector_db.get_vector_db()

    print("Vector DB ready.")
    app.run(host="0.0.0.0", debug=True, port=5000, threaded=True)
