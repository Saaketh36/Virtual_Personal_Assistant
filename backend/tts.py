import subprocess
import tempfile
import os

PIPER_EXE = r"C:\Users\saake\AppData\Local\piper\piper\piper.exe"
VOICE_MODEL = r"C:\Users\saake\AppData\Local\piper\en_US-lessac-medium.onnx"


def synthesize(text: str) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp_path = f.name

    try:
        subprocess.run(
            [PIPER_EXE, "--model", VOICE_MODEL, "--output_file", tmp_path],
            input=text.encode(),
            check=True,
            capture_output=True
        )
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        os.unlink(tmp_path)