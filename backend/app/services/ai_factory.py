from app.core.settings import settings
from openai import OpenAI
from google import genai

import instructor 

def create_client():
    provider = settings.llm_provider
    if provider == 'openai':
        return instructor.from_openai(
            OpenAI(
                api_key=settings.llm_api_key,
                base_url=settings.llm_base_url,
            )            
        )
    
    if provider == 'gemini':
        return instructor.from_gemini(
            genai.Client(
                api_key=settings.llm_api_key
            )
        )