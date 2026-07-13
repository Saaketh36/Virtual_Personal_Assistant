# Virtual Assist

Virtual Assist is a full-stack personal AI assistant with chat, memory, web search, Gmail integration, PDF upload/generation/editing, and voice input/output.

The project has a React/Vite frontend and a FastAPI backend. The assistant uses Groq chat models through Agno, stores long-term conversation memory in PostgreSQL with pgvector, uses Ollama for embeddings, uses Serper for web search, uses Google Gmail APIs for email actions, uses PyMuPDF for PDF handling, Faster-Whisper for speech-to-text, and Piper for text-to-speech.

## Features

- Chat assistant with session-aware conversation context.
- Long-term memory using embeddings and pgvector similarity search.
- Web search for current or factual queries through Serper.
- Gmail OAuth integration with inbox, search, message detail, send, draft, reply, and mark-as-read support.
- Natural-language email drafting with approval before sending.
- PDF upload, text extraction, summarization, generation, enrichment, section editing, and find/replace.
- Voice input through browser recording and Faster-Whisper transcription.
- Voice output through Piper-generated WAV audio.
- React chat UI with sessions drawer, Gmail panel, PDF attachment, PDF download cards, code block rendering, and search badges.

## Project Structure

```text
D:\virtual_assist
+-- backend
|   +-- main.py                 # FastAPI app and API endpoints
|   +-- agent.py                # Main assistant routing and tool orchestration
|   +-- memory.py               # PostgreSQL + pgvector memory layer
|   +-- embedding.py            # Ollama embedding client
|   +-- email_routes.py         # Gmail API routes used by the frontend
|   +-- gmail_auth.py           # Gmail OAuth helper
|   +-- tts.py                  # Piper text-to-speech helper
|   +-- whisper_service.py      # Separate Faster-Whisper transcription API
|   +-- tools
|       +-- email_tool.py       # Gmail tool functions
|       +-- pdf_tool.py         # PDF upload, extraction, generation, and editing
|       +-- web_search.py       # Serper web search tool
+-- frontend
|   +-- src
|   |   +-- App.jsx             # Main React state and request flow
|   |   +-- components          # Topbar, session drawer, messages, input, Gmail panel
|   +-- package.json
+-- ingest.py                   # Small embedding/database test script
+-- output/pdf                  # Generated project handbook PDF
```

## Architecture

```text
User
  |
  v
React/Vite frontend on localhost:5173
  |-- text chat ------------> POST /chat
  |-- PDF upload -----------> POST /chat-pdf
  |-- recorded audio -------> POST /chat-voice-input
  |-- Gmail panel ----------> /email/* routes
  |
  v
FastAPI backend on localhost:8000
  |-- agent.py routes intent and runs Groq/Agno
  |-- memory.py saves/retrieves vector memory from PostgreSQL + pgvector
  |-- tools/web_search.py calls Serper
  |-- tools/email_tool.py calls Gmail API
  |-- tools/pdf_tool.py uses PyMuPDF
  |-- tts.py calls local Piper
  |
  +--> Whisper service on localhost:8001
  +--> Ollama on localhost:11434 for embeddings
  +--> PostgreSQL database
  +--> Local backend/storage for PDF files
```

## Backend API

| Endpoint | Purpose |
| --- | --- |
| `GET /` | Backend health check. |
| `POST /chat` | Text chat request. Calls `generate_reply`. |
| `POST /chat-voice` | Text chat plus synthesized audio response. |
| `POST /chat-voice-input` | Audio upload, transcription, assistant reply, and synthesized audio. |
| `POST /chat-pdf` | Multipart PDF upload or PDF-related request. |
| `GET /email/status` | Gmail auth status and unread count. |
| `GET /email/auth` | Starts Gmail OAuth and returns consent URL. |
| `GET /email/inbox` | Fetches inbox messages. |
| `GET /email/search?q=...` | Searches Gmail using Gmail query syntax. |
| `GET /email/message/{message_id}` | Fetches full email detail. |
| `POST /email/message/{message_id}/read` | Marks a message as read. |
| `POST /email/send` | Sends an email. |
| `POST /email/reply` | Replies to an email thread. |
| `POST /email/draft` | Saves a draft email. |

Generated PDF files are served from:

```text
http://localhost:8000/files/<filename>.pdf
```

## Environment Variables

Create a `.env` file in `backend/` with the values needed for your local setup.

```env
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_CODE_MODEL=llama-3.1-8b-instant

SERPER_API_KEY=your_serper_api_key
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vpa_db
```

Gmail also needs:

- `backend/credentials.json` from Google Cloud Console.
- `backend/token.json`, generated after OAuth login.

Do not commit API keys, `credentials.json`, or `token.json`.

## Required Local Services

- PostgreSQL with the pgvector extension enabled.
- Ollama running on `http://localhost:11434`.
- Ollama embedding model:

```bash
ollama pull nomic-embed-text
```

- Backend API on port `8000`.
- Whisper transcription service on port `8001`.
- Frontend dev server on port `5173`.
- Piper executable and voice model configured in `backend/tts.py`.

## Setup

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Start the main backend:

```bash
uvicorn main:app --reload --port 8000
```

Start the Whisper service in another terminal:

```bash
cd backend
uvicorn whisper_service:app --reload --port 8001
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

### 3. Ollama

Make sure Ollama is running and the embedding model is available:

```bash
ollama serve
ollama pull nomic-embed-text
```

### 4. Database

The code expects a `conversations` table with text content, summaries, timestamps, and a pgvector embedding column.

An inferred schema is:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  summary text,
  embedding vector(<embedding_dimension>) NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Replace `<embedding_dimension>` with the actual dimension returned by the local `nomic-embed-text` model.

## How The Assistant Works

1. The frontend sends a message, PDF, email action, or audio recording to the backend.
2. `backend/main.py` receives the request and calls `generate_reply` in `backend/agent.py`.
3. `agent.py` retrieves recent context and relevant long-term memory.
4. The agent routes the request:
   - PDF requests go to the PDF workflow.
   - Email requests use Gmail tools or pending approval state.
   - Current/search-like requests can use web search.
   - Coding requests use the code-oriented Groq model.
   - Normal chat uses the main Groq model.
5. The final reply is saved to PostgreSQL with an embedding.
6. The frontend renders the assistant response, including PDF links, code blocks, search badges, or audio.

## Important Files To Understand

- `backend/agent.py`: The main brain of the project.
- `backend/main.py`: API entry point.
- `backend/memory.py`: Vector memory and rolling summaries.
- `backend/tools/pdf_tool.py`: PDF generation and editing.
- `backend/tools/email_tool.py`: Gmail API actions.
- `frontend/src/App.jsx`: Main frontend request and state flow.
- `frontend/src/components/InputBar.jsx`: Text, PDF, and microphone input.
- `frontend/src/components/Messages.jsx`: Message rendering and PDF download cards.
- `frontend/src/components/EmailPanel.jsx`: Gmail UI.

## Known Limitations

- The root database schema/migration file is not currently checked in.
- Frontend sessions are stored in React state and are not persisted after refresh.
- `backend/tts.py` uses hardcoded local Piper paths.
- Gmail panel uses relative `/email/*` requests, while chat uses absolute `http://localhost:8000/*` requests. A Vite proxy or shared API base URL may be needed depending on how the app is served.
- Scanned/image-only PDFs are not OCR processed.
- PDF text replacement works best when replacement text fits the original layout.
- Generated/uploaded PDFs are stored locally and are not automatically cleaned up.
- Automated tests are not currently included.

