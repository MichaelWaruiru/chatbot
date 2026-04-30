from flask import Flask, request, jsonify, render_template, session, Response
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
    Main chatbot endpoint with SSE streaming.
    Cached and chitchat responses are returned immediately (non‑streamed).
    All other queries are streamed via Server‑Sent Events.
    """
    # Ensure session exists
    if "session_id" not in session:
        session["session_id"] = str(uuid.uuid4())
        logger.info(f"[NEW SESSION] {session['session_id']}")

    payload = request.get_json()
    question = payload.get("message", "")

    # 2. CHITCHAT INTERCEPTION LOGIC
    clean_question = re.sub(r'[^\w\s]', '', question).strip().lower()
    if clean_question in CHITCHAT_RESPONSES:
        logger.info("CHITCHAT INTERCEPT HIT")
        response = {
            "answer": CHITCHAT_RESPONSES[clean_question],
            "graphBase64": None
        }
        return jsonify(response)
    
    logger.info(f"[USER QUESTION] {question}")
    
    # 3. Check Redis LLM cache (full answer)
    cached = get_cached_answer(question)
    if cached:
        logger.info(f"LLM CACHE HIT: {question}")
        return jsonify(cached)
    
    # 4. Pre‑check for visualization intent (skip FAISS cache for graphs)
    viz_keywords = ["graph", "chart", "show", "visualize", "plot", "display", "diagram"]
    is_viz_intent = any(keyword in question.lower() for keyword in viz_keywords)
    
    if not is_viz_intent:
        semantic_hit = get_similar_que(question)
        if semantic_hit:
            logger.info("[CACHE HIT - FAISS SEMANTIC]")
            return jsonify(semantic_hit)

    logger.info(f"LLM CACHE MISS: {question}")
    
    # 5. Streaming response for live generation
    def generate_stream():
        config = {"configurable": {"thread_id": session["session_id"]}}
        last_answer = None

        try:
            # Stream graph events – each node update is yielded
            for event in graph.stream({"question": question}, config=config):
                # → When the answer node finishes, send its partial/full answer
                if "answer" in event:
                    ans_data = event["answer"]
                    last_answer = ans_data.get("answer")
                    yield f"data: {json.dumps(ans_data)}\n\n"

                # → When visualisation node finishes, send graph assets
                if "visualize" in event:
                    viz_data = event["visualize"]
                    yield f"data: {json.dumps(viz_data)}\n\n"

        except ServerError as e:
            logger.warning(f"[503 ERROR during stream] {e}")
            yield f"data: {json.dumps({'answer': 'The AI service is currently experiencing high demand. Please try again shortly.'})}\n\n"
        except Exception as e:
            logger.exception("[UNEXPECTED STREAM ERROR]")
            yield f"data: {json.dumps({'answer': 'Something went wrong on the server. Please try again later.'})}\n\n"
        finally:
            # After streaming, cache the final answer if appropriate
            if last_answer and not is_viz_intent:
                response_to_cache = {
                    "answer": last_answer,
                    "graphBase64": None,
                    "graphSvg": None,
                    "vizData": None
                }
                # We can't capture graph data here easily, but text‑only caching is safe
                store_cached_answer(question, response_to_cache)
                store_que_pair(question, response_to_cache)
                logger.info("[CACHE STORE - TEXT ONLY, REDIS + FAISS]")
            elif last_answer:
                logger.info("[SKIP CACHE - VISUALIZATION]")

    return Response(generate_stream(), mimetype='text/event-stream')

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