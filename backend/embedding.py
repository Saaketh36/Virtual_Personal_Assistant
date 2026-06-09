import httpx

OLLAMA_URL = "http://localhost:11434"

async def embed(text: str):
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={
                "model": "nomic-embed-text",
                "prompt": text
            }
        )

        r.raise_for_status()

        return r.json()["embedding"]