from langchain_openai import ChatOpenAI
from app.core.settings import settings

def get_llm():
    return ChatOpenAI(
        model="openrouter/free",
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
    )