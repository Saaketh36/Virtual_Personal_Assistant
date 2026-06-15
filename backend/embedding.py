import httpx

OLLAMA_URL = "http://localhost:11434"


async def embed(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={
                "model": "nomic-embed-text",
                "prompt": text
            }
        )
        r.raise_for_status()
        return r.json()["embedding"]