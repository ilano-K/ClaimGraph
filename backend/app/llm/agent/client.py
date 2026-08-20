from langchain_openai import ChatOpenAI
from app.core.settings import settings
from app.llm.client_factory import AGENT_MODEL

def get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=AGENT_MODEL,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        # deepseek on this provider defaults to thinking mode, which rejects
        # structured-output response_formats and tool_choice=required with
        # HTTP 400. The compile path already disables thinking for the same
        # reason; the agent must too. ``extra_body`` (not ``model_kwargs``)
        # nests the param correctly under the request body.
        extra_body={"thinking": {"type": "disabled"}},
    )