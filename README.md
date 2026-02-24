# AayushBot — Personal AI Chatbot

A personal AI chatbot and portfolio assistant built for [aayushmaan-bot.vercel.app](https://aayushmaan-bot.vercel.app). It answers questions about my background, projects, skills, and experience using a RAG pipeline backed by a personal knowledge base. Includes a voice agent (Beta) for speech-based interaction.


## Architecture

```
Browser (Vercel)          EC2 Instance
┌──────────────┐     ┌─────────────────────────────────┐
│   React UI   │────▶│  Nginx (reverse proxy + SSL)    │
│   CSS Modules│     │         │                        │
│   Vercel     │     │    FastAPI (uvicorn, 2 workers)  │
└──────────────┘     │     ┌───┴───────────────┐        │
                     │     │  LangChain Agent   │        │
                     │     │  GPT-4o + Tools    │        │
                     │     └───┬───────────────┘        │
                     │         │                        │
                     │   ┌─────┴──────┐                 │
                     │   │ RAG Tool   │  Pinecone       │
                     │   │ Web Search │  Tavily          │
                     │   │ Age/Date   │                 │
                     │   └────────────┘                 │
                     └─────────────────────────────────┘
```

### Frontend
- **React** with CSS Modules
- Deployed on **Vercel** with `VITE_API_URL` env for dev/prod switching
- SSE streaming — tokens render as they arrive from the backend
- Dark/light mode, mobile responsive
- **Vercel Analytics** for usage tracking

### Backend
- **FastAPI** on EC2 behind **Nginx** (SSL via Certbot)
- **LangChain agent** with GPT-4o, structured tool routing via o3-mini
- **Pinecone** vector store for RAG (OpenAI `text-embedding-3-small`)
- Auto re-indexes when the knowledge base (`aayushmaan.md`) changes (MD5 hash check)
- **SSE streaming** on `/chat` — tokens streamed via `astream` with `stream_mode="messages"`
- **Dynamic prompt middleware** — switches system prompt between chat and voice contexts
- **LangSmith** tracing enabled (background callbacks for zero latency impact)

### Voice Agent
- **Speech-to-Text**: `faster-whisper` (base model, CPU, int8) — preloaded at startup
- **Text-to-Speech**: `edge-tts` (`en-US-AndrewMultilingualNeural`)
- Endpoint: `POST /voice-chat` — accepts audio upload, transcribes, runs RAG agent, returns audio response
- Dedicated voice system prompt for concise, natural spoken replies (no markdown/links)
- Accessible via a "Try Voice Agent" button in the navbar

### Tools
| Tool | Purpose |
|------|---------|
| `rag_tool` | Retrieves from Pinecone with metadata-filtered similarity search |
| `web_search_tool` | Tavily web search for current events |
| `age_calculator` | Calculates age from DOB |
| `calendar_tool` | Current date/time info |

## CI/CD

- **GitHub Actions** — manual post-deploy health check (`workflow_dispatch`)
- Hits `/health` and `/chat` endpoints on the live EC2 server
- Validates response status and non-empty reply

## Load Testing

Tested with **Locust** from a separate EC2 instance.

- **15 concurrent users**, ramp-up 2/s
- **0% failure rate**
- **Median response time**: 6.2s
- **95th percentile**: 19s
- **Throughput**: ~0.7 req/s

High response times are expected — each request involves LLM inference, RAG retrieval from Pinecone, and SSE streaming.

![Locust Load Test Charts](locust.png)

## Tech Stack

**Frontend**: React, CSS Modules, Vite, Vercel Analytics
**Backend**: Python, FastAPI, Uvicorn, Nginx, Gunicorn
**AI/ML**: LangChain, LangGraph, OpenAI GPT-4o, o3-mini, Pinecone, Tavily
**Voice**: faster-whisper, edge-tts
**Infra**: AWS EC2, Vercel, Certbot SSL, systemd
**Testing**: Locust, GitHub Actions
**Observability**: LangSmith
