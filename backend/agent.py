import os
from dotenv import load_dotenv
from agno.agent import Agent
from agno.models.ollama import Ollama
from tools.web_search import search_web
from memory import get_relevant_context, save_conversation, count_raw_turns, summarize_old_turns

load_dotenv()

OLLAMA_HOST = os.getenv("OLLAMA_URL", "http://localhost:11434")

# Primary model — general reasoning and chat
llama_model = Ollama(id="llama3.1:8b", host=OLLAMA_HOST)

# Secondary model — coding / multilingual tasks
qwen_model = Ollama(id="qwen2.5:7b", host=OLLAMA_HOST)

CODE_KEYWORDS = ["code", "script", "python", "function", "debug", "error", "class ", "fix this", "write a program"]

SEARCH_KEYWORDS = [
    "latest", "current", "today", "news", "weather", "price", "stock",
    "who", "what", "where", "when", "why", "how", "won", "winner", "score",
    "president", "prime minister", "population", "temperature", "forecast",
    "recent", "now", "2026", "search", "game", "match", "vs", "versus"
]


def pick_model(user_text: str):
    text = user_text.lower()
    if any(k in text for k in CODE_KEYWORDS):
        return qwen_model
    return llama_model


def needs_search(user_text: str) -> bool:
    # First check if the tool was actually called during execution
    from tools.web_search import web_search_called
    if web_search_called.get():
        return True
    
    # Fallback/pre-evaluation check for gating (can be used inside agent)
    text = user_text.lower()
    return any(k in text for k in SEARCH_KEYWORDS) or text.strip().endswith("?")


async def summarize_text(text: str) -> str:
    summarizer = Agent(model=llama_model, markdown=False)
    result = await summarizer.arun(
        f"Summarize the following conversation in 2-3 concise sentences:\n\n{text}"
    )
    return result.content


async def generate_reply(user_text: str, session_id: str) -> str:
    from tools.web_search import web_search_called
    web_search_called.set(False)

    # 1. Retrieve relevant memory
    context = await get_relevant_context(user_text, session_id)

    # 2. Route to the right model
    model = pick_model(user_text)

    # 3. Build system prompt
    system_message = (
        "You are a helpful personal AI assistant running locally.\n\n"
        "RULES:\n"
        "1. For math, general knowledge, reasoning, or anything you already know — "
        "answer directly in plain English.\n"
        "2. Be concise and direct.\n\n"
    )
    if context:
        system_message += f"Relevant memory:\n{context}\n"

    # 4. Build and run agent — attach search tool if query looks like a question/info query
    text = user_text.lower()
    has_search_trigger = any(k in text for k in SEARCH_KEYWORDS) or text.strip().endswith("?")
    tools = [search_web] if has_search_trigger else []

    agent = Agent(
        model=model,
        system_message=system_message,
        tools=tools,
        markdown=False,
    )

    result = await agent.arun(user_text)
    reply = result.content

    # 5. Save this exchange to memory
    await save_conversation(user_text, reply, session_id)

    # 6. Rolling summary if too many raw turns
    if await count_raw_turns(session_id) > 10:
        await summarize_old_turns(session_id, summarize_text)

    return reply