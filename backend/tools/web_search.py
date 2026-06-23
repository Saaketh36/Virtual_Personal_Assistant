import httpx
import os
from dotenv import load_dotenv
from contextvars import ContextVar

load_dotenv()

SERPER_API_KEY = os.getenv("SERPER_API_KEY")
SERPER_URL = "https://google.serper.dev/search"

web_search_called = ContextVar("web_search_called", default=False)


async def search_web(query: str) -> str:
    """Search the web for current information and return a summary of top results."""
    web_search_called.set(True)
    async with httpx.AsyncClient() as client:
        r = await client.post(
            SERPER_URL,
            headers={
                "X-API-KEY": SERPER_API_KEY,
                "Content-Type": "application/json"
            },
            json={"q": query}
        )
        r.raise_for_status()
        data = r.json()

    results = []

    if "answerBox" in data:
        ab = data["answerBox"]
        results.append(ab.get("answer") or ab.get("snippet", ""))

    for item in data.get("organic", [])[:5]:
        title = item.get("title", "")
        snippet = item.get("snippet", "")
        link = item.get("link", "")
        results.append(f"{title}: {snippet} ({link})")

    if not results:
        return "No results found."

    return "\n".join(results)