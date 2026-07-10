from llm import gemini_flash_fast, gemini_pro_sql
from langchain_core.messages import HumanMessage

print("Testing Gemini Flash (Fast Model)...")
try:
    flash = gemini_flash_fast()
    response = flash.invoke([HumanMessage(content="Say 'Flash is connected and working!'")])
    print(f"Success: {response.content}\n")
except Exception as e:
    print(f"Flash Error: {e}\n")

print("Testing Gemini Pro (SQL Model)...")
try:
    pro = gemini_pro_sql()
    response = pro.invoke([HumanMessage(content="Say 'Pro is connected and working!'")])
    print(f"Success: {response.content}\n")
except Exception as e:
    print(f"Pro Error: {e}\n")
