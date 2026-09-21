import os
import asyncio
import concurrent.futures
import hashlib
import math

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "all-mpnet-base-v2")
FALLBACK_DIM = int(os.getenv("EMBEDDING_FALLBACK_DIM", "768"))

_model = None
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
_warned_fallback = False


def _get_model():
    global _model
    if SentenceTransformer is None:
        return None
    if _model is None:
        # Load the model locally using sentence-transformers
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def _fallback_embed(text: str, dim: int = FALLBACK_DIM) -> list[float]:
    """Deterministic lightweight embedding used when sentence-transformers is unavailable."""
    vec = [0.0] * dim
    tokens = (text or "").lower().split()
    if not tokens:
        tokens = [""]

    for token in tokens:
        digest = hashlib.blake2b(token.encode("utf-8", errors="ignore"), digest_size=16).digest()
        index = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vec[index] += sign

    norm = math.sqrt(sum(value * value for value in vec)) or 1.0
    return [value / norm for value in vec]


async def embed(text: str) -> list[float]:
    loop = asyncio.get_running_loop()

    def _do_encode():
        global _warned_fallback
        model = _get_model()
        if model is None:
            if not _warned_fallback:
                print("[embedding] sentence-transformers is not installed; using fallback embeddings.")
                _warned_fallback = True
            return _fallback_embed(text)
        return model.encode(text, show_progress_bar=False).tolist()

    embedding = await loop.run_in_executor(_executor, _do_encode)
    return embedding