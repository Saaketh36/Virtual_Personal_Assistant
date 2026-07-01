"""Gmail OAuth2 authentication helper."""

from pathlib import Path
from socket import socket
from threading import Lock, Thread
from urllib.parse import parse_qs
from wsgiref.simple_server import make_server

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
]

BASE_DIR = Path(__file__).parent
CREDENTIALS_FILE = BASE_DIR / "credentials.json"
TOKEN_FILE = BASE_DIR / "token.json"

_AUTH_LOCK = Lock()
_AUTH_THREAD: Thread | None = None
_AUTH_URL: str | None = None


def _missing_credentials_error() -> FileNotFoundError:
    return FileNotFoundError(
        "credentials.json not found in backend/. "
        "Please download it from Google Cloud Console -> APIs & Services -> Credentials."
    )


def _get_free_port() -> int:
    with socket() as sock:
        sock.bind(("localhost", 0))
        return sock.getsockname()[1]


def _build_flow(redirect_uri: str) -> Flow:
    if not CREDENTIALS_FILE.exists():
        raise _missing_credentials_error()

    return Flow.from_client_secrets_file(
        str(CREDENTIALS_FILE),
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )


def _run_oauth_callback_server(flow: Flow, port: int) -> None:
    def app(environ, start_response):
        query = parse_qs(environ.get("QUERY_STRING", ""))

        if "error" in query:
            body = f"Authentication failed: {query['error'][0]}".encode()
            start_response("400 Bad Request", [("Content-Type", "text/plain")])
            return [body]

        code = query.get("code", [None])[0]
        if not code:
            start_response("400 Bad Request", [("Content-Type", "text/plain")])
            return [b"Authentication failed: missing code."]

        try:
            flow.fetch_token(code=code)
            with open(TOKEN_FILE, "w") as token_file:
                token_file.write(flow.credentials.to_json())
            body = b"Gmail connected successfully. You can close this tab."
            start_response("200 OK", [("Content-Type", "text/plain")])
            return [body]
        except Exception as exc:
            body = f"Authentication failed: {exc}".encode()
            start_response("500 Internal Server Error", [("Content-Type", "text/plain")])
            return [body]

    with make_server("localhost", port, app) as server:
        server.handle_request()


def start_oauth_flow() -> str:
    """Start a local callback server and return the Google consent URL."""
    global _AUTH_THREAD, _AUTH_URL

    with _AUTH_LOCK:
        if _AUTH_THREAD and _AUTH_THREAD.is_alive() and _AUTH_URL:
            return _AUTH_URL

        port = _get_free_port()
        redirect_uri = f"http://localhost:{port}/"
        flow = _build_flow(redirect_uri)
        authorization_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )

        _AUTH_URL = authorization_url
        _AUTH_THREAD = Thread(
            target=_run_oauth_callback_server,
            args=(flow, port),
            daemon=True,
        )
        _AUTH_THREAD.start()
        return authorization_url


def get_gmail_service():
    """Return an authenticated Gmail API service object."""
    if not CREDENTIALS_FILE.exists():
        raise _missing_credentials_error()

    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_FILE, "w") as token_file:
                token_file.write(creds.to_json())
        else:
            raise RuntimeError("Gmail is not authenticated. Visit /email/auth first.")

    return build("gmail", "v1", credentials=creds)


def is_authenticated() -> bool:
    """Return True if a valid token exists."""
    if not TOKEN_FILE.exists():
        return False

    try:
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        if creds and creds.valid:
            return True
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_FILE, "w") as token_file:
                token_file.write(creds.to_json())
            return True
    except Exception:
        pass

    return False
