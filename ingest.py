import asyncio
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, "backend"))

import psycopg
from embedding import embed

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
            INSERT INTO conversations
            (session_id, role, content, source, memory_type, embedding)
            VALUES (%s, %s, %s, %s, %s, %s::vector)
            """,
            ("__global__", "document", doc, "test_ingest", "document", vector_str)
        )

    conn.commit()
    conn.close()

    print("Documents inserted successfully into conversations table.")


if __name__ == "__main__":
    asyncio.run(main())