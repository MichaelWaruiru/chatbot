import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
# from langchain_openai import ChatOpenAI
# from langchain_ollama import ChatOllama

load_dotenv()

def gemini_pro_sql():
    """
    BEST FOR SQL: Uses Gemini 2.5 Pro as primary.
    Instantly falls back to Flash if Pro is rate-limited or busy.
    """
    primary = ChatGoogleGenerativeAI(
        model="gemini-2.5-pro",
        temperature=0,
        max_output_tokens=1024,
        google_api_key=os.getenv("GOOGLE_API_KEY")
    )
    
    # Define Flash as the backup model
    fallback = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0,
        max_output_tokens=1024,
        google_api_key=os.getenv("GOOGLE_API_KEY")
    )
    
    # This ensures that if the 'primary' fails, LangChain automatically tries the 'fallback'
    return primary.with_fallbacks([fallback])

def gemini_flash_fast():
    """
    BEST FOR CHAT/TRANSLATION: Uses Gemini 2.5 Flash Lite as primary for speed.
    Falls back to standard Flash if Lite is unavailable.
    """
    primary = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash-lite",
        temperature=0,
        max_output_tokens=1024,
        google_api_key=os.getenv("GOOGLE_API_KEY")
    )
    
    fallback = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0,
        max_output_tokens=1024,
        google_api_key=os.getenv("GOOGLE_API_KEY")
    )
    
    return primary.with_fallbacks([fallback])

# --- Legacy Support (Uncomment if needed) ---
# def openai_llm():
#     return ChatOpenAI(model="gpt-4o", temperature=0)

# def llama_llm():
#     return ChatOllama(model="qwen2.5-coder", base_url="http://localhost:11434
