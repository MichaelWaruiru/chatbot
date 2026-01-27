import json
import re
from langgraph.graph import StateGraph
from typing import TypedDict
from langchain_core.messages import HumanMessage
from utils import detect_language, translate_text

class State(TypedDict):
    question: str
    language: str
    intent: str
    data: dict
    answer: str
    
def load_data():
    with open("data/public_data.json", "r", encoding="utf-8") as f:
        return json.load(f)
    
DATA = load_data()

INTENT_MAP = {
    "system_name": ["system name", "name of system", "what is the system called"],
    "system_info": ["system_info", "system information", "about system", "info", "tell me more"],
    "cooperatives_total": ["cooperatives_total", "number of cooperatives", "cooperatives registered"],
    "members_total": ["members_total", "total members", "members", "female members", "male members"],
    "members_by_state": ["members_by_state", "members per state", "members by state"],
    "female_members": ["female members"],
    "male_members": ["male members"],
    "directors_total": ["directors_total", "number of directors", "directors"],
    
}

def detect_lan_and_translate(state: State, llm):
    text = state["question"]
    lang = detect_language(text)
        
    if lang == "en":
        return {
            "question": text,
            "language": "en",
        }
        
    translated, _ = translate_text(text, llm, target_lang="English")
    
    return {
        "question": translated,
        "language": "ar"
    }

def detect_intent(state: State, llm):
    prompt = (
        "Classify the intent into one of:\n"
        "- system_name\n"
        "- system_info\n"
        "- cooperatives_total\n"
        "- members_total\n"
        "- female_members\n"
        "- male_members\n"
        "- members_by_state\n"
        "- directors_total\n"
        "- unknown\n\n"
        f"Question: {state['question']}"
    )
    raw_intent = llm.invoke([HumanMessage(content=prompt)]).content.strip().lower()

    # Normalize to canonical intent using substring matching
    for canonical, aliases in INTENT_MAP.items():
        for alias in aliases:
            if alias.lower() in raw_intent:
                return {"intent": canonical}

    return {"intent": "unknown"}


def select_data(state: State):
    intent = state["intent"]
    
    if intent == "system_info":
        return {"data": DATA["system_description"]}
    
    if intent == "cooperatives_total":
        return {"data": DATA["cooperatives_registered"]}

    if intent == "directors_total":
        return {"data": DATA["directors"]}

    if intent == "members_total":
        return {"data": DATA["members"]}

    if intent == "members_by_state":
        return {"data": DATA["members_by_state"]}

    return {"data": None}

def generate_answer(state: State, llm):
    if state["data"] is None:
        return {
            "answer": "I can only provide general public information available in this system."
        }

    prompt = (
        "Using the data below, answer the question clearly.\n"
        "Do NOT add new information, assumptions or extra facts.\n\n"
        f"Data:\n{state['data']}\n\n"
        f"Question:\n{state['question']}"
    )

    response = llm.invoke([HumanMessage(content=prompt)]).content.strip()
    return {"answer": response}


def build_graph(llm):
    graph = StateGraph(State)

    graph.add_node("translate", lambda s: detect_lan_and_translate(s, llm))
    graph.add_node("intent", lambda s: detect_intent(s, llm))
    graph.add_node("data", select_data)
    graph.add_node("answer", lambda s: generate_answer(s, llm))

    graph.set_entry_point("translate")
    graph.add_edge("translate", "intent")
    graph.add_edge("intent", "data")
    graph.add_edge("data", "answer")

    return graph.compile()