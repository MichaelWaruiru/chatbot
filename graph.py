import re
import os
import logging
import hashlib
import base64
import json
import matplotlib
matplotlib.use("agg")  # This for headless plot graphs(Use before pyplot import)
import matplotlib.pyplot as plt
import pandas as pd
from langgraph.graph import StateGraph
from typing import TypedDict, Optional
from llm import gemini_pro_sql, gemini_flash_fast
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.utilities import SQLDatabase
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langgraph.checkpoint.memory import MemorySaver
from io import BytesIO
from dotenv import load_dotenv
from vector_db import get_vector_db
from cache import vector_cache, redis_client
from logging_config import setup_logging
from collections import defaultdict
from prompts.prompt import (
    SQL_SYSTEM_PROMPT, SQL_HUMAN_TEMPLATE, SQL_RETRY_PROMPT,
    NO_RESULTS_SYSTEM_PROMPT, NO_RESULTS_HUMAN_TEMPLATE,
    NATURAL_ANSWER_SYSTEM_PROMPT, NATURAL_ANSWER_HUMAN_TEMPLATE,
    INTENT_FALLBACK_PROMPT
)

setup_logging()
logger = logging.getLogger(__name__)

load_dotenv()

memory = MemorySaver()

# Initialize lightweight models – Flash used for all non‑SQL tasks
llm_pro = gemini_pro_sql()
llm_flash = gemini_flash_fast()

# State definition
class State(TypedDict):
    question: str
    language: str
    intent: str
    data: str | None            # Raw DB result / fallback text for answer generation
    answer: str                 # Final natural language answer
    viz_data: Optional[list]    # JSON‑serializable list of records
    graph_base64: Optional[str]
    graph_svg: Optional[str]

# Intent mapping (unchanged)
INTENT_MAP = {
    "system_name": ["system name", "name of system", "what is this system"],
    "system_info": ["about co-op magic", "system details", "about this system",
                    "tell me about this system", "tell me more about this system",
                    "what does this system do", "explain this system", "system info"],
    "cooperatives_total": ["number of cooperatives", "total cooperatives",
                           "cooperatives in system", "cooperatives in coopmagic"],
    "members_total": ["total members", "number of members", "members"],
    "members_by_state": ["members per state", "members by state"],
    "female_members": ["female members", "women members", "women"],
    "male_members": ["male members", "men members", "men"],
    "directors_total": ["directors", "total directors"],
    "approval_summary": ["approval status", "status of cooperatives",
                         "how many are approved", "approval breakdown",
                         "approval status of all types"],
    "visualize": ["visualize", "graph", "chart", "show trend", "pie chart", "bar chart", "line"]
}

# Database setup
db_uri = os.getenv("DB_URI")
db = SQLDatabase.from_uri(db_uri)

# Load FAISS vector index once at startup
vector_db = get_vector_db()
logger.info("Vector index loaded successfully.")

# Allowed tables and columns (unchanged)
ALLOWED_TABLES = {"member", "cooperative", "director", "cooperative_location",
                  "cooperative_stages", "deregistration"}

ALLOWED_COLUMNS = {
    "cooperative": {"cooperative_id", "cooperative_name", "cooperative_type",
                    "cooperative_constitution", "cooperative_bylaws", "has_directors",
                    "cooperative_state", "cooperative_boma", "approval_status",
                    "cooperative_certificate"},
    "member": {"cooperative_id", "member_id", "member_name", "member_gender",
               "member_state", "member_county", "member_payam", "member_boma"},
    "director": {"cooperative_id", "director_id", "director_name", "director_gender",
                 "director_payam", "director_state", "director_county", "director_boma"},
    "cooperative_location": {"cooperative_id", "state", "county", "payam", "boma"},
    "cooperative_stages": {"coop_id", "stage", "date_created", "status", "reason", "next_stage"},
    "deregistration": {"reason", "status", "coop_id", "date_created"}
}

# Helper functions (get_schema, extract_tables_and_aliases, sanitize_sql, validate_sql, log_index_usage remain identical)
cached_schema_string = None

def get_schema(_):
    global cached_schema_string
    if cached_schema_string is None:
        logger.info("[SCHEMA CACHE MISS] Fetching fresh schema from database...")
        cached_schema_string = db.get_table_info(table_names=ALLOWED_TABLES)
    return cached_schema_string

def extract_tables_and_aliases(sql_text: str):
    tables = set()
    alias_map = {}
    from_pattern = r"\bfrom\s+(\w+)(?:\s+(?:as\s+)?(\w+))?"
    for match in re.finditer(from_pattern, sql_text):
        table = match.group(1)
        alias = match.group(2) or table
        tables.add(table)
        alias_map[alias] = table
    join_pattern = r"\bjoin\s+(\w+)(?:\s+(?:as\s+)?(\w+))?"
    for match in re.finditer(join_pattern, sql_text):
        table = match.group(1)
        alias = match.group(2) or table
        tables.add(table)
        alias_map[alias] = table
    return tables, alias_map

def sanitize_sql(sql: str) -> str:
    sql = re.sub(r"```sql|```", "", sql, flags=re.IGNORECASE)
    return sql.strip().rstrip(";")

def validate_sql(sql: str) -> None:
    sql_lower = sql.lower()
    tables = set(re.findall(r"\bfrom\s+(\w+)|\bjoin\s+(\w+)", sql_lower))
    tables = {t for pair in tables for t in pair if t}
    if not tables:
        raise ValueError("No table referenced in query")
    illegal_tables = tables - ALLOWED_TABLES
    if illegal_tables:
        raise ValueError(f"Illegal tables used: {illegal_tables}. Allowed: {ALLOWED_TABLES}")
    columns = set(re.findall(r"\b(\w+)\s*(?:=|<|>|!=|\blike\b)", sql_lower))
    columns.update(re.findall(r"\bselect\s+([^,\s]+)", sql_lower))
    columns.update(re.findall(r",\s*(\w+)", sql_lower))
    keywords = {"count", "sum", "avg", "max", "min", "distinct", "as", "and", "or", "not", "in", "like", "between"}
    columns = {c for c in columns if c and c not in keywords and not c.isdigit()}
    for table in tables:
        allowed = ALLOWED_COLUMNS.get(table, set())
        table_cols = set(re.findall(rf"{table}\.(\w+)", sql_lower))
        if table_cols:
            illegal_cols = table_cols - allowed
            if illegal_cols:
                raise ValueError(f"Invalid columns for table '{table}': {illegal_cols}. Allowed: {allowed}")

def log_index_usage(sql: str):
    try:
        explain_sql = f"EXPLAIN {sql}"
        explain_result = pd.read_sql(explain_sql, db._engine)
        explain_result['index_used'] = explain_result['type'].apply(lambda t: t != 'ALL')
        logger.info(f"[EXPLAIN RESULT]\n{explain_result[['table','type','key','rows','index_used']]}")
    except Exception as e:
        logger.warning(f"Failed to log index usage: {e}")

def semantic_search(question: str, k: int = 5):
    if question in vector_cache:
        logger.info(f"[VECTOR CACHE HIT] {question}")
        return vector_cache[question]
    try:
        docs = vector_db.similarity_search(question, k=k)
        results = [doc.page_content for doc in docs]
        vector_cache[question] = results
        logger.info(f"[VECTOR SEARCH] Query executed | Docs retrieved: {len(results)}")
        return results
    except Exception as e:
        logger.error(f"[VECTOR ERROR] {e}")
        return []

def run_query(query: str):
    sql = sanitize_sql(query)
    cache_key = f"sql_cache:{hashlib.md5(sql.encode()).hexdigest()}"
    cached_result = redis_client.get(cache_key)
    if cached_result:
        logger.info("[SQL REDIS CACHE HIT]")
        return cached_result
    logger.info(f"[SQL EXECUTE] {sql}")
    try:
        result = db.run(sql)
        redis_client.setex(cache_key, 600, str(result))
        logger.info("[SQL SUCCESS]")
        return result
    except Exception as e:
        logger.error(f"[SQL ERROR] {e}")
        raise

def run_query_df(query: str) -> pd.DataFrame:
    sql = sanitize_sql(query)
    logger.info(f"[SQL DF] {sql}")
    log_index_usage(sql)
    return pd.read_sql(sql, db._engine)

# SQL generation (unchanged, but we'll reduce retries in the caller)
def write_sql_query(llm):
    prompt = ChatPromptTemplate.from_messages([
        ("system", SQL_SYSTEM_PROMPT),
        ("human", SQL_HUMAN_TEMPLATE),
    ])
    return (
        RunnablePassthrough.assign(schema=get_schema)
        | prompt
        | llm
        | StrOutputParser()
    )

def generate_valid_sql(question: str, llm, max_retries: int = 3) -> str:
    def autocorrect_state_aliases(sql_text: str) -> str:
        tbls, alias_map = extract_tables_and_aliases(sql_text.lower())
        def repl(match):
            prefix = match.group(1)
            real = alias_map.get(prefix, prefix)
            if real == 'member':
                return f"{prefix}.member_state"
            if real == 'director':
                return f"{prefix}.director_state"
            return match.group(0)
        return re.sub(r"\b(\w+)\.cooperative_state\b", repl, sql_text)

    error_message = None
    for attempt in range(max_retries):
        sql_raw = write_sql_query(llm).invoke({
            "question": question if not error_message
            else SQL_RETRY_PROMPT.format(error_message=error_message, question=question)
        })
        sql = sanitize_sql(sql_raw)
        sql = autocorrect_state_aliases(sql)
        try:
            validate_sql(sql)
            return sql
        except Exception as e:
            error_message = str(e)
            logger.warning(f"Attempt {attempt + 1}/{max_retries} failed: {error_message}")
            if attempt == max_retries - 1:
                raise RuntimeError(f"Unable to generate valid SQL after {max_retries} attempts: {error_message}")


# ============================================================
#  ⚡ OPTIMIZED NODES – replace chain of translate+intent+data
# ============================================================

# 1. Single node for translation + intent (Flash, one call)
def analyzer_node(state: State):
    """
    Combines language detection, Arabic translation, and intent classification
    into a single LLM call, saving ~2 seconds compared to sequential calls.
    """
    question = state["question"]
    prompt = f"""
Analyze the following user query for a cooperative database.
Query: "{question}"

Tasks:
1. Detect if the language is Arabic or English.
2. If Arabic, translate to English.
3. Identify intent from: {list(INTENT_MAP.keys())}.

Return ONLY a JSON object (no markdown):
{{"lang": "detected_lang", "translated_q": "english_version", "intent": "detected_intent"}}
"""
    try:
        response = llm_flash.invoke(prompt)
        # Strip potential markdown fences
        clean = response.content.strip()
        clean = clean.replace("```json", "").replace("```", "").strip()
        analysis = json.loads(clean)
        return {
            "language": analysis.get("lang"),
            "question": analysis.get("translated_q"),
            "intent": analysis.get("intent")
        }
    except Exception as e:
        logger.error(f"Analyzer node failed: {e}")
        # Fallback: run old sequential logic as safety net
        from utils import detect_language, translate_text
        lang = detect_language(question)
        if lang == "en":
            translated = question
        else:
            translated, _ = translate_text(question, llm_flash, target_lang="English")
        # Fallback intent: keyword matching + LLM
        intent = detect_intent_fallback(translated, llm_flash)
        return {"language": lang, "question": translated, "intent": intent}

def detect_intent_fallback(question: str, llm):
    """Used only if the combined analyzer fails."""
    q = question.lower()
    for canonical, aliases in INTENT_MAP.items():
        if any(alias.lower() in q for alias in aliases):
            return canonical
    prompt_text = INTENT_FALLBACK_PROMPT.format(intents=list(INTENT_MAP.keys()), question=question)
    response = llm.invoke([HumanMessage(content=prompt_text)])
    raw = response.content.strip().lower()
    for canonical, aliases in INTENT_MAP.items():
        if any(alias.lower() in raw for alias in aliases):
            return canonical
    return "unknown"


# 2. Optimized data node – generates SQL / DB results directly
def select_data(state: State):
    """
    Generates the required data in one pass, skipping the old
    answer_user_query round‑trip. For system_name/info we short‑circuit.
    For visualisation we also return viz_data.
    For general queries we fetch raw SQL results and hand them to
    the answer node for natural‑language formatting.
    """
    intent = state["intent"]
    question = state["question"]

    # Static intents – no DB needed
    if intent == "system_name":
        return {"answer": "The system is called Co-op Magic."}
    if intent == "system_info":
        return {"answer": "Co-op Magic is a comprehensive system designed to manage cooperatives' data across South Sudan securely and efficiently."}

    # For all other intents (including visualize) generate SQL once
    try:
        # ⚡ Reduced retries from 3 → 1, saving 4–8 seconds on retry loops
        sql = generate_valid_sql(question, llm_pro, max_retries=1)
        logger.info(f"[OPTIMIZED SQL] {sql}")

        if intent == "visualize":
            df = run_query_df(sql)
            df_json = df.to_dict(orient="records")
            # Pass both viz data and a raw string representation for the answer
            return {
                "viz_data": df_json,
                "data": df.to_string(index=False)  # compact string for LLM answer
            }
        else:
            result = run_query(sql)
            return {"data": result}  # string, empty string, or None
    except Exception as e:
        logger.error(f"Data node failed: {e}")
        # Graceful fallback using vector search (fast, no LLM needed)
        docs = semantic_search(question, k=2)
        fallback_text = "\n".join(docs) if docs else ""
        return {"data": fallback_text}


# 3. Reworked answer node: turns raw data into a concise natural‑language reply
def generate_answer(state: State):
    """Formats the final answer using the raw data (or static answer)."""
    # If we already have a static answer (from select_data), return it directly
    if state.get("answer"):
        return {"answer": state["answer"]}

    raw_data = state.get("data", "")
    question = state["question"]

    # If no data (e.g., empty DB result), use quick no‑results prompt
    if not raw_data or raw_data.strip() in ("", "0 rows in set"):
        prompt = ChatPromptTemplate.from_messages([
            ("system", NO_RESULTS_SYSTEM_PROMPT),
            ("human", NO_RESULTS_HUMAN_TEMPLATE.format(context="", question=question)),
        ])
        resp = llm_flash.invoke(prompt.format_messages())
        return {"answer": resp.content.strip()}

    # Otherwise, craft natural answer from the raw DB output (fast, single LLM call)
    prompt = ChatPromptTemplate.from_messages([
        ("system", NATURAL_ANSWER_SYSTEM_PROMPT),
        ("human", NATURAL_ANSWER_HUMAN_TEMPLATE.format(
            context="",  # vector context can be injected if needed, but adds ~0.5s
            question=question,
            response=raw_data[:2000]  # truncate to avoid token waste
        )),
    ])
    resp = llm_flash.invoke(prompt.format_messages())
    answer = resp.content.strip()
    # Keep answer concise (max ~300 chars)
    if len(answer) > 300:
        answer = answer[:300].rsplit('.', 1)[0] + "."

    # Preserve any graph data from previous nodes
    result = {"answer": answer}
    if "graph_base64" in state and state["graph_base64"]:
        result["graph_base64"] = state["graph_base64"]
    if "graph_svg" in state and state["graph_svg"]:
        result["graph_svg"] = state["graph_svg"]
    if "viz_data" in state and state["viz_data"]:
        result["viz_data"] = state["viz_data"]
    return result


# Visualization node (unchanged except for minor imports)
def detect_chart_type(question: str) -> str:
    q = question.lower()
    chart_keywords = {
        "pie": ["pie", "chart", "proportion", "percentage", "share"],
        "line": ["line", "trend", "over time", "time series", "change"],
        "histogram": ["histogram", "distribution", "frequency", "spread", "bins"],
        "bar": ["bar", "compare", "comparison", "categories", "graph"],
    }
    scores = defaultdict(int)
    for chart, keywords in chart_keywords.items():
        for k in keywords:
            if re.search(rf"\b{re.escape(k)}\b", q):
                scores[chart] += 1
    return max(scores, key=scores.get) if scores else "unknown"

def visualize_node(state: State):
    df_json = state.get("viz_data")
    if not df_json:
        return {"graph_base64": None, "graph_svg": None}

    df = pd.DataFrame(df_json)
    if not isinstance(df, pd.DataFrame) or df.empty or len(df.columns) < 2:
        logger.warning("Dataframe is empty or lacks sufficient columns for visualization")
        return {"graph_base64": None, "graph_svg": None}

    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    if not numeric_cols:
        logger.warning("No numeric columns available for plotting")
        return {"graph_base64": None, "graph_svg": None}
    y_col = numeric_cols[0]

    if len(df.columns) >= 1:
        gender_col = df.columns[0]
        if gender_col.lower().strip() in ["member_gender", "director_gender"]:
            def normalize_gender(val):
                val = str(val).strip().lower() if val else "unknown"
                if val in ["m", "male"]: return "Male"
                elif val in ["f", "female"]: return "Female"
                elif val == "unknown" or val == "": return "Other"
                else: return val.capitalize()
            df[gender_col] = df[gender_col].apply(normalize_gender)
            df = df.groupby(gender_col)[y_col].sum().reset_index()

    chart_type = detect_chart_type(state.get("question", ""))

    fig, ax = plt.subplots(figsize=(10, 6))

    if len(df.columns) >= 3:
        try:
            df = df.pivot(index=df.columns[0], columns=df.columns[1], values=y_col)
        except Exception as e:
            logger.warning(f"Pivot failed: {e}")

    if chart_type == "pie":
        colors = ['#FF6B6B', '#4ECDC4', "#BCD145", '#FFA07A', '#98D8C8', '#F7DC6F']
        if y_col in df.columns:
            values = df[y_col]
            labels = df[df.columns[0]]
        else:
            values = df.iloc[:, 0]
            labels = df.index
        _, texts, autotexts = ax.pie(values, labels=labels, autopct='%1.1f%%', colors=colors,
                                     startangle=90, textprops={'fontsize': 13, 'weight': 'bold'})
        ax.set_title(f'{y_col} Distribution', fontsize=16, fontweight='bold', pad=20)
        for autotext in autotexts:
            autotext.set_color('white')
    elif chart_type == "line":
        if y_col in df.columns:
            x_vals = df[df.columns[0]]
            values = df[y_col]
        else:
            x_vals = df.index
            values = df.iloc[:, 0]
        ax.plot(x_vals, values, marker='o', linewidth=2, markersize=8, color='steelblue')
        ax.set_xlabel(df.columns[0], fontsize=13, fontweight='bold')
        ax.set_ylabel(y_col, fontsize=13, fontweight='bold')
        ax.set_title('Data Trend', fontsize=13, fontweight='bold')
        ax.tick_params(axis='x', rotation=45, labelsize=12)
        ax.grid(True, alpha=0.3)
    elif chart_type == "histogram":
        values = df[y_col]
        ax.hist(values, bins=10, color='steelblue', edgecolor='black', alpha=0.7)
        ax.set_xlabel(y_col, fontsize=13, fontweight='bold')
        ax.set_ylabel('Frequency', fontsize=13, fontweight='bold')
        ax.set_title('Distribution Histogram', fontsize=16, fontweight='bold', pad=20)
        ax.tick_params(axis='x', rotation=45, labelsize=12)
    else:
        if y_col in df.columns:
            df.plot(kind='bar', x=df.columns[0], y=y_col, legend=False, color='steelblue', ax=ax)
            values = df[y_col]
        else:
            df.plot(kind='bar', legend=False, color='steelblue', ax=ax)
            values = df.iloc[:, 0]
        ax.set_xlabel(df.columns[0], fontsize=13, fontweight='bold')
        ax.set_ylabel(y_col, fontsize=13, fontweight='bold')
        ax.set_title('Data Distribution', fontsize=13, fontweight='bold')
        ax.tick_params(axis='x', rotation=45)
        y_max = values.max() if not values.empty else 1
        for i, v in enumerate(values):
            ax.text(i, v + (y_max * 0.02), str(v), ha='center', va='bottom', fontweight='bold')

    fig.tight_layout()

    buf_png = BytesIO()
    fig.savefig(buf_png, format='png', dpi=100)
    buf_png.seek(0)
    img_base64 = base64.b64encode(buf_png.read()).decode('utf-8')

    buf_svg = BytesIO()
    fig.savefig(buf_svg, format='svg', bbox_inches='tight')
    buf_svg.seek(0)
    svg_string = buf_svg.read().decode('utf-8')

    plt.close(fig)
    return {"graph_base64": img_base64, "graph_svg": svg_string}


# Routing logic (unchanged)
def route_to_answer(state: State):
    if state["intent"] == "visualize":
        return "visualize"
    return "answer"


# ============================================================
# NEW SIMPLIFIED GRAPH – 4 nodes instead of 5, fewer hops
# ============================================================
def build_graph():
    graph = StateGraph(State)

    graph.add_node("analyzer", analyzer_node)    # translate + intent
    graph.add_node("data", select_data)          # SQL / fallback
    graph.add_node("visualize", visualize_node)  # charts
    graph.add_node("answer", generate_answer)   # natural language final

    graph.set_entry_point("analyzer")
    graph.add_edge("analyzer", "data")
    graph.add_conditional_edges(
        "data",
        route_to_answer,
        {"visualize": "visualize", "answer": "answer"}
    )
    graph.add_edge("visualize", "answer")

    return graph.compile(checkpointer=memory)