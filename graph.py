import re
import os
import logging
import hashlib
import base64
import matplotlib
matplotlib.use("agg")  # This for headless plot graphs(Use before pyplot import)
import matplotlib.pyplot as plt
import pandas as pd

from langgraph.graph import StateGraph
from typing import TypedDict, Optional
from langchain_core.messages import HumanMessage
from utils import detect_language, translate_text
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
from prompts.prompt import (
    SQL_SYSTEM_PROMPT,
    SQL_HUMAN_TEMPLATE,
    SQL_RETRY_PROMPT,
    NO_RESULTS_SYSTEM_PROMPT,
    NO_RESULTS_HUMAN_TEMPLATE,
    NATURAL_ANSWER_SYSTEM_PROMPT,
    NATURAL_ANSWER_HUMAN_TEMPLATE,
    INTENT_FALLBACK_PROMPT
)

setup_logging()
logger = logging.getLogger(__name__)

load_dotenv()

memory = MemorySaver()

# Initialize our Hybrid Models
llm_pro = gemini_pro_sql()
llm_flash = gemini_flash_fast()

# State definition
class State(TypedDict):
    question: str
    language: str
    intent: str
    data: str | None
    answer: str
    sql: Optional[str]
    viz_data: Optional[list]
    graph_base64: Optional[str]
    graph_svg: Optional[str]

# Intent mapping
INTENT_MAP = {
    "system_name": [
        "system name",
        "name of system",
        "what is this system"
    ],
    "system_info": [
        "about co-op magic",
        "system details",
        "about this system",
        "tell me about this system",
        "tell me more about this system",
        "what does this system do",
        "explain this system",
        "system info"
    ],
    "cooperatives_total": [
        "number of cooperatives",
        "total cooperatives",
        "cooperatives in system",
        "cooperatives in coopmagic"
    ],
    "members_total": [
        "total members",
        "number of members",
        "members"
    ],
    "members_by_state": [
        "members per state",
        "members by state"
    ],
    "female_members": [
        "female members",
        "women members",
        "women"
    ],
    "male_members": [
        "male members",
        "men members",
        "men"
    ],
    "directors_total": [
        "directors",
        "total directors"
    ],
    "approval_summary": [
        "approval status",
        "status of cooperatives",
        "how many are approved",
        "approval breakdown",
        "approval status of all types"
    ],
    "visualize": [
        "visualize",
        "graph",
        "chart",
        "show trend",
        "pie chart",
        "bar chart",
        "line"
    ]
}

# Database setup
db_uri = os.getenv("DB_URI")
db = SQLDatabase.from_uri(db_uri)

# Load FAISS vector index once at startup
vector_db = get_vector_db()
logger.info("Vector index loaded successfully.")

# Allowed tables that the LLM is allowed to query
ALLOWED_TABLES = {"member", "cooperative", "director", "cooperative_location", "cooperative_stages", "deregistration"}

# Whitelist of allowed columns per table
ALLOWED_COLUMNS = {
    "cooperative": {
        "cooperative_id",
        "cooperative_name",
        "cooperative_type",
        "cooperative_constitution",
        "cooperative_bylaws",
        "has_directors",
        "cooperative_state",
        "cooperative_boma",
        "approval_status",
        "cooperative_certificate"
    },

    "member": {
        "cooperative_id",
        "member_id",
        "member_name",
        "member_gender",
        "member_state",
        "member_county",
        "member_payam",
        "member_boma"
    },

    "director": {
        "cooperative_id",
        "director_id",
        "director_name",
        "director_gender",
        "director_payam",
        "director_state",
        "director_county",
        "director_boma"
    },

    "cooperative_location": {
        "cooperative_id",
        "state",
        "county",
        "payam",
        "boma"
    },

    "cooperative_stages": {
        "coop_id",
        "stage",
        "date_created",
        "status",
        "reason",
        "next_stage"
    },

    "deregistration": {
        "reason",
        "status",
        "coop_id",
        "date_created"
    }
}

# Precompiled regex for performance
SQL_CODE_BLOCK_RE = re.compile(r"```sql|```", re.IGNORECASE)
PERCENT_RE = re.compile(r"(?<!%)%(?!%)")

# Precompiled chart regex
CHART_PATTERNS = {
    "pie": re.compile(r"\b(pie|chart|proportion|percentage|share)\b"),
    "line": re.compile(r"\b(line|trend|over time|time series|change)\b"),
    "histogram": re.compile(r"\b(histogram|distribution|frequency|spread|bins)\b"),
    "bar": re.compile(r"\b(bar|compare|comparison|categories|graph)\b"),
}

# Helper functions
cached_schema_string = None

def get_schema(_):
    global cached_schema_string
    if cached_schema_string is None:
        cached_schema_string = db.get_table_info(
            table_names=ALLOWED_TABLES
        )

    return cached_schema_string

# SQL generation prompt chain
SQL_PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", SQL_SYSTEM_PROMPT),
        ("human", SQL_HUMAN_TEMPLATE),
    ]
)

SQL_CHAIN = (
    RunnablePassthrough.assign(schema=get_schema)
    | SQL_PROMPT
    | llm_pro
    | StrOutputParser()
)

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
    sql = SQL_CODE_BLOCK_RE.sub("", sql)
    sql = sql.strip().rstrip(";")

    # Escape date_format placeholders
    sql = PERCENT_RE.sub("%%", sql)

    return sql

def validate_sql(sql: str) -> None:
    sql_lower = sql.lower()

    tables = set(
        re.findall(r"\bfrom\s+(\w+)|\bjoin\s+(\w+)", sql_lower)
    )

    tables = {
        t for pair in tables for t in pair if t
    }

    if not tables:
        raise ValueError("No table referenced in query")

    illegal_tables = tables - ALLOWED_TABLES
    if illegal_tables:
        raise ValueError(
            f"Illegal tables used: {illegal_tables}. "
            f"Allowed: {ALLOWED_TABLES}"
        )

def log_index_usage(sql: str):
    try:
        explain_sql = f"EXPLAIN {sql}"

        explain_result = pd.read_sql(
            explain_sql,
            db._engine
        )

        explain_result["index_used"] = explain_result["type"].apply(
            lambda t: t != "ALL"
        )

        logger.info(
            f"[EXPLAIN RESULT]\n"
            f"{explain_result[['table','type','key','rows','index_used']]}"
        )

    except Exception as e:
        logger.warning(f"Failed to log index usage: {e}")

def semantic_search(question: str, k: int = 3):
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
    normalized_sql = " ".join(sql.lower().split())

    cache_key = (f"sql_cache:{hashlib.md5(normalized_sql.encode()).hexdigest()}")
    cached_result = redis_client.get(cache_key)

    if cached_result:
        logger.info("[SQL REDIS CACHE HIT]")
        return cached_result

    logger.info(f"[SQL EXECUTE] {sql}")
    try:
        result = db.run(sql)
        # Store in Redis for 10 minutes (600 seconds)
        redis_client.setex(
            cache_key,
            600,
            str(result)
        )

        logger.info("[SQL SUCCESS]")
        return result
    except Exception as e:
        logger.error(f"[SQL ERROR] {e}")
        raise

def extract_llm_text(resp) -> str:
    content = resp.content

    if isinstance(content, list):
        first = content[0]

        if isinstance(first, dict):
            return first.get("text", "").strip()

        return str(first).strip()

    return str(content).strip()

def generate_valid_sql(question: str, max_retries: int = 3) -> str:
    def autocorrect_state_aliases(sql_text: str) -> str:
        _, alias_map = extract_tables_and_aliases(
            sql_text.lower()
        )

        def repl(match):
            prefix = match.group(1)
            real = alias_map.get(prefix, prefix)

            if real == "member":
                return f"{prefix}.member_state"

            if real == "director":
                return f"{prefix}.director_state"

            return match.group(0)

        return re.sub(
            r"\b(\w+)\.cooperative_state\b",
            repl,
            sql_text
        )

    error_message = None

    for attempt in range(max_retries):
        sql_raw = SQL_CHAIN.invoke(
            {
                "question": question
                if not error_message
                else SQL_RETRY_PROMPT.format(
                    error_message=error_message,
                    question=question
                )
            }
        )

        sql = sanitize_sql(sql_raw)

        sql = autocorrect_state_aliases(sql)

        try:
            validate_sql(sql)
            return sql

        except Exception as e:
            error_message = str(e)

            logger.warning(
                f"Attempt {attempt + 1}/{max_retries} failed: "
                f"{error_message}"
            )

            if attempt == max_retries - 1:
                raise RuntimeError(
                    f"Unable to generate valid SQL after "
                    f"{max_retries} attempts: {error_message}"
                )

# Natural answer generation
def answer_user_query(question: str, sql: Optional[str] = None) -> str:
    try:
        context_docs = semantic_search(question)

        context = (
            "\n".join(context_docs[:3])
            if context_docs
            else ""
        )

        if not sql:
            sql = generate_valid_sql(question, llm_pro)

        logger.info(f"[FINAL SQL USED] {sql}")

        response = run_query(sql)

    except Exception as e:
        logger.error(
            f"Query generation/execution failed: {str(e)}"
        )

        return (
            "I couldn't find information related to that question. "
            "Try asking about cooperatives, members, directors, or locations."
        )

    if (
        not response
        or response.strip() == ""
        or response.strip() == "0 rows in set"
    ):

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", NO_RESULTS_SYSTEM_PROMPT),

                (
                    "human",
                    NO_RESULTS_HUMAN_TEMPLATE.format(
                        context=context,
                        question=question
                    )
                ),
            ]
        )

        resp = llm_flash.invoke(
            prompt.format_messages()
        )

        return extract_llm_text(resp)

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", NATURAL_ANSWER_SYSTEM_PROMPT),

            (
                "human",
                NATURAL_ANSWER_HUMAN_TEMPLATE.format(
                    context=context,
                    question=question,
                    response=response
                )
            ),
        ]
    )

    resp = llm_flash.invoke(
        prompt.format_messages()
    )

    answer = extract_llm_text(resp)

    if len(answer) > 300:
        answer = (
            answer[:300]
            .rsplit(".", 1)[0]
            + "."
        )

    return answer

# Language detection and translation
def detect_lan_and_translate(state: State, llm):
    text = state["question"]

    lang = detect_language(text)

    if lang == "en":
        return {
            "question": text,
            "language": "en"
        }

    translated, _ = translate_text(
        text,
        llm,
        target_lang="English"
    )

    return {
        "question": translated,
        "language": "ar"
    }

# Intent detection
def detect_intent(state: State, llm):
    question = state["question"].lower()

    viz_aliases = INTENT_MAP.get("visualize", [])

    if any(
        alias.lower() in question
        for alias in viz_aliases
    ):
        return {"intent": "visualize"}

    for canonical, aliases in INTENT_MAP.items():
        if any(
            alias.lower() in question
            for alias in aliases
        ):
            return {"intent": canonical}

    prompt_text = INTENT_FALLBACK_PROMPT.format(
        intents=list(INTENT_MAP.keys()),
        question=state["question"]
    )

    response = llm.invoke(
        [HumanMessage(content=prompt_text)]
    )

    raw_intent = extract_llm_text(response).lower()

    for canonical, aliases in INTENT_MAP.items():
        if any(
            alias.lower() in raw_intent
            for alias in aliases
        ):
            return {"intent": canonical}

    return {"intent": "unknown"}

# Data selection
def select_data(state: State):
    question = state["question"].lower()

    if (
        "name of this system" in question
        or "what is the name of this system" in question
    ):
        return {
            "answer": "The system is called Co-op Magic."
        }

    intent = state["intent"]

    if intent == "system_name":
        return {
            "answer": "The system is called Co-op Magic."
        }

    if intent == "system_info":
        return {
            "answer": (
                "Co-op Magic is a comprehensive system designed "
                "to manage cooperatives' data across South Sudan "
                "securely and efficiently."
            )
        }

    try:
        sql = generate_valid_sql(
            state["question"],
            llm_pro
        )

        if intent == "visualize":
            df = run_query_df(sql)

            answer = answer_user_query(
                state["question"],
                sql
            )

            df_json = df.to_dict(
                orient="records"
            )

            return {
                "sql": sql,
                "viz_data": df_json,
                "answer": answer
            }

        return {
            "sql": sql,
            "answer": answer_user_query(
                state["question"],
                sql
            ),
            "viz_data": None,
            "graph_base64": None,
            "graph_svg": None
        }

    except Exception as e:
        logger.error(f"[SELECT DATA ERROR] {e}")

        return {
            "answer": (
                "I couldn't process your request at the moment."
            ),
            "viz_data": None,
            "graph_base64": None,
            "graph_svg": None
        }

# UPDATED: generate_answer now routes viz_data and graph_svg to the output
def generate_answer(state: State):
    result = {
        "answer": state.get("answer")
        or "No data found."
    }

    if "graph_base64" in state and state["graph_base64"]:
        result["graph_base64"] = state["graph_base64"]

    if "graph_svg" in state and state["graph_svg"]:
        result["graph_svg"] = state["graph_svg"]

    if "viz_data" in state and state["viz_data"]:
        result["viz_data"] = state["viz_data"]

    return result

def run_query_df(query: str) -> pd.DataFrame:
    sql = sanitize_sql(query)

    logger.info(f"[SQL DF] {sql}")

    # Log explain only in debug mode
    if os.getenv("ENABLE_SQL_EXPLAIN") == "true":
        log_index_usage(sql)

    return pd.read_sql(
        sql,
        db._engine
    )

def detect_chart_type(question: str) -> str:
    q = question.lower()

    scores = {
        chart: len(pattern.findall(q))
        for chart, pattern in CHART_PATTERNS.items()
    }

    scores = {
        k: v
        for k, v in scores.items()
        if v > 0
    }

    if not scores:
        return "unknown"

    return max(scores, key=scores.get)

# UPDATED: Completely rewritten for Thread Safety, IndexError prevention, and SVG output
def visualize_node(state: State):
    df_json = state.get("viz_data")
    if not df_json:
        return {
            "graph_base64": None,
            "graph_svg": None
        }

    df = pd.DataFrame(df_json)

    if (
        not isinstance(df, pd.DataFrame)
        or df.empty
        or len(df.columns) < 2
    ):
        logger.warning(
            "Dataframe is empty or lacks sufficient columns for visualization"
        )

        return {
            "graph_base64": None,
            "graph_svg": None
        }

    numeric_cols = df.select_dtypes(
        include="number"
    ).columns.tolist()

    if not numeric_cols:
        logger.warning(
            "No numeric columns available for plotting"
        )

        return {
            "graph_base64": None,
            "graph_svg": None
        }

    y_col = numeric_cols[0]

    chart_type = detect_chart_type(
        state.get("question", "")
    )

    fig, ax = plt.subplots(figsize=(10, 6))

    if chart_type == "histogram":
        values = df[y_col]

        ax.hist(
            values,
            bins=10,
            color="steelblue",
            edgecolor="black",
            alpha=0.7
        )

        ax.set_xlabel(
            y_col,
            fontsize=13,
            fontweight="bold"
        )

        ax.set_ylabel(
            "Frequency",
            fontsize=13,
            fontweight="bold"
        )

        ax.set_title(
            "Distribution Histogram",
            fontsize=16,
            fontweight="bold",
            pad=20
        )

    else:
        if y_col in df.columns:
            df.plot(
                kind="bar",
                x=df.columns[0],
                y=y_col,
                legend=False,
                color="steelblue",
                ax=ax
            )

    fig.tight_layout()

    # Generate PNG only
    buf_png = BytesIO()

    fig.savefig(
        buf_png,
        format="png",
        dpi=100
    )

    buf_png.seek(0)

    img_base64 = base64.b64encode(
        buf_png.read()
    ).decode("utf-8")

    # Generate SVG only when needed
    svg_string = None

    if state.get("download_svg"):
        buf_svg = BytesIO()

        fig.savefig(
            buf_svg,
            format="svg",
            bbox_inches="tight"
        )

        buf_svg.seek(0)

        svg_string = (
            buf_svg.read()
            .decode("utf-8")
        )

    plt.close(fig)

    return {
        "graph_base64": img_base64,
        "graph_svg": svg_string
    }

def route_to_answer(state: State):
    if state["intent"] == "visualize":
        return "visualize"
    return "answer"

def build_graph():
    graph = StateGraph(State)

    graph.add_node("translate", lambda s: detect_lan_and_translate(s, llm_flash))
    graph.add_node("intent", lambda s: detect_intent(s, llm_flash))

    graph.add_node("data", select_data)
    graph.add_node("visualize", visualize_node)
    graph.add_node("answer", generate_answer)

    graph.set_entry_point("translate")
    graph.add_edge("translate", "intent")
    graph.add_edge("intent", "data")
    
    graph.add_conditional_edges(
        "data",
        route_to_answer,
        {
            "visualize": "visualize",
            "answer": "answer"
        }
    )
    graph.add_edge("visualize", "answer")

    return graph.compile(checkpointer=memory)