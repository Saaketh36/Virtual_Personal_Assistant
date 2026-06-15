import asyncio
import psycopg
from backend.embedding import embed

DB_CONFIG = {
    "host": "localhost",
    "dbname": "vpa_db",
    "user": "postgres",
    "password": "postgres"
}

DOCS = [
    "Python uses automatic memory management and reference counting.",
    "PostgreSQL is an open source relational database.",
    "Transformers use self-attention to understand language.",
    "Ollama runs large language models locally."
]

async def main():
    conn = psycopg.connect(**DB_CONFIG)
    cur = conn.cursor()

    for doc in DOCS:
        vector = await embed(doc)

        vector_str = "[" + ",".join(map(str, vector)) + "]"

        cur.execute(
            """
            INSERT INTO documents
            (content, source, embedding)
            VALUES (%s, %s, %s::vector)
            """,
            (doc, "test", vector_str)
        )

    conn.commit()
    conn.close()

    print("Documents inserted")

asyncio.run(main())