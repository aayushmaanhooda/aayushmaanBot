# VAPI Voice Call Agent - Complete Architecture

## Overview

A voice-based AI call agent that lets users have a real-time phone conversation with Aayushmaan's digital twin. The agent answers questions using RAG (Retrieval-Augmented Generation) by pulling verified information from a Pinecone vector store.

**Stack:** VAPI (voice infra) + OpenAI GPT-4o-mini (LLM) + ElevenLabs (TTS) + Deepgram (STT) + Pinecone (vector DB) + FastAPI (webhook server) + React (frontend)

---

## End-to-End Flow

```
User clicks call button
        |
        v
  [1] React frontend calls vapi.start(assistantConfig)
        |
        v
  [2] VAPI Cloud receives the config (system prompt, tools, voice, serverUrl)
        |
        v
  [3] VAPI establishes a WebRTC audio stream with the browser
        |
        v
  [4] VAPI speaks the firstMessage via ElevenLabs TTS
        |
        v
  [5] User speaks a question (e.g. "What projects have you built?")
        |
        v
  [6] Deepgram STT converts speech to text
        |
        v
  [7] Text goes to GPT-4o-mini with the system prompt
        |
        v
  [8] GPT-4o-mini decides to call search_knowledge(query: "...")
        |                          |
        |    GPT rewrites the      |
        |    user's question       |
        |    into an optimized     |
        |    search query          |
        v                          v
  [9] VAPI sends POST to serverUrl (your FastAPI backend)
        |
        |   Payload:
        |   {
        |     "message": {
        |       "type": "tool-calls",
        |       "toolCallList": [{
        |         "id": "call_abc123",
        |         "function": {
        |           "name": "search_knowledge",
        |           "arguments": {"query": "projects built by Aayushmaan"}
        |         }
        |       }]
        |     }
        |   }
        |
        v
  [10] FastAPI /vapi-chat endpoint receives the webhook
        |
        v
  [11] query_rag() runs similarity search on Pinecone
        |
        |   - Embeds the query using text-embedding-3-small (OpenAI)
        |   - Searches "aayush-docs" namespace
        |   - Returns top 4 matching document chunks
        |
        v
  [12] Backend responds with RAG results
        |
        |   Response:
        |   {
        |     "results": [{
        |       "toolCallId": "call_abc123",
        |       "result": "Source: {...}\nContent: Built a Voice RAG app..."
        |     }]
        |   }
        |
        v
  [13] VAPI feeds RAG results back to GPT-4o-mini
        |
        v
  [14] GPT-4o-mini formulates a natural spoken response
        |   (2-3 sentences, no markdown, conversational tone)
        |
        v
  [15] ElevenLabs TTS converts text to speech audio
        |
        v
  [16] Audio streams back to browser via WebRTC
        |
        v
  User hears the answer
```

---

## What VAPI Handles (You Don't Build This)

| Capability | Provider Used | Details |
|---|---|---|
| Speech-to-Text (STT) | Deepgram (default) | Converts user's voice to text in real-time |
| LLM Reasoning | OpenAI GPT-4o-mini | Processes conversation, decides when to call tools, formulates responses |
| Text-to-Speech (TTS) | ElevenLabs | Converts LLM response to natural voice audio |
| Audio Streaming | WebRTC | Real-time bidirectional audio between browser and VAPI servers |
| Turn Detection | VAPI built-in | Detects when user stops speaking to trigger LLM response |
| Tool/Function Calling | OpenAI function calling | LLM decides when to call `search_knowledge` and writes the query |
| Query Rewriting | GPT-4o-mini | LLM automatically optimizes user's question into a better search query |

---

## What You Built

### Frontend (`frontend/src/`)

#### `config/vapiConfig.js` - VAPI Configuration

```
vapiConfig.js
  |
  |-- vapi instance (initialized with VITE_VAPI_PUBLIC_KEY)
  |
  |-- buildAssistantConfig() --> returns transient assistant config
        |
        |-- model.provider: "openai"
        |-- model.model: "gpt-4o-mini"
        |-- model.messages: [system prompt with today's date injected]
        |-- model.tools: [search_knowledge function definition]
        |-- serverUrl: points to your FastAPI /vapi-chat endpoint
        |-- server.timeoutSeconds: 30
        |-- voice.provider: "11labs"
        |-- voice.voiceId: "DHeSUVQvhhYeIxNUbtj3"
        |-- firstMessage: greeting spoken when call connects
        |-- endCallPhrases: ["goodbye", "bye", ...] triggers call end
```

**Key Design Decisions:**
- Config is built as a **function** (not a constant) so `today's date` is always fresh
- Uses a **transient assistant** (config sent with each call) rather than a dashboard-created assistant
- System prompt forces the LLM to ALWAYS call `search_knowledge` before answering - prevents hallucination
- 30-second timeout gives the RAG query enough time to respond

#### `components/VoiceModal.jsx` - Call UI Component

Three UI states managed by `callStatus`:

```
idle -----> connecting -----> active
  ^              |               |
  |              |               |
  +--------------+---------------+
       (on error / end call)
```

- **idle**: Shows green call button, "Tap to call"
- **connecting**: Plays `ring.mp3` on loop, shows "Calling..."
- **active**: Shows call timer (MM:SS), Speaking/Listening indicator, red end button

VAPI SDK events used:
- `call-start` --> transition to active, stop ringtone
- `call-end` --> transition to idle
- `speech-start` / `speech-end` --> toggle Speaking/Listening indicator
- `error` --> transition to idle, log error

### Backend (`backend/app/`)

#### `main.py` - `/vapi-chat` Webhook Endpoint

VAPI sends ALL call events to your `serverUrl`. The endpoint handles:

```
POST /vapi-chat
  |
  |-- message.type == "tool-calls"  --> process function calls, return results
  |-- message.type == anything else --> return {} (ignore)
```

**VAPI webhook event types received (all sent to serverUrl):**

| Event Type | What It Is | Do We Process It? |
|---|---|---|
| `tool-calls` | LLM wants to call search_knowledge | YES - run RAG, return results |
| `conversation-update` | Conversation state changed | No - return {} |
| `speech-update` | User/assistant started/stopped speaking | No - return {} |
| `status-update` | Call status changed (started/ended) | No - return {} |
| `end-of-call-report` | Call summary after hang-up | No - return {} |

**Tool call response format:**
```json
{
  "results": [
    {
      "toolCallId": "call_abc123",
      "result": "Source: {metadata}\nContent: document text..."
    }
  ]
}
```

#### `agent.py` - `query_rag()` Function

Fast, lightweight RAG query designed for voice latency requirements:

```
query_rag(query)
  |
  |-- Pinecone similarity_search(query, k=4)
  |     |
  |     |-- Embedding model: text-embedding-3-small (OpenAI, 1536 dims)
  |     |-- Index: aayush-docs namespace
  |     |-- Returns top 4 most similar document chunks
  |
  |-- Serialize results as "Source: {metadata}\nContent: {text}"
  |
  |-- Return concatenated string
```

**Why no LLM filter routing for voice?**
The text chat RAG (`rag_tool`) uses an extra LLM call (`o3-mini`) to route queries to specific document sections. For voice, this adds 3-5 seconds of latency which causes VAPI timeouts. The voice version skips this and does a direct vector search instead - fast enough for real-time conversation.

---

## Assistant Config Breakdown

Every field in the config and what it controls:

| Field | Value | Purpose |
|---|---|---|
| `name` | "AayushBot Voice" | Assistant identifier in VAPI dashboard/logs |
| `model.provider` | "openai" | LLM provider |
| `model.model` | "gpt-4o-mini" | Specific model - fast and cheap, good enough for voice |
| `model.messages` | System prompt | Personality, rules, date awareness, voice formatting rules |
| `model.tools` | [search_knowledge] | Function the LLM can call to query RAG |
| `serverUrl` | Your backend URL + /vapi-chat | Where VAPI sends webhooks (tool calls + events) |
| `server.timeoutSeconds` | 30 | Max seconds VAPI waits for your webhook response |
| `voice.provider` | "11labs" | TTS provider (ElevenLabs) |
| `voice.voiceId` | "DHeSUVQvhhYeIxNUbtj3" | Specific ElevenLabs voice clone |
| `firstMessage` | Greeting text | Spoken immediately when call connects |
| `endCallMessage` | Goodbye text | Spoken when call ends |
| `endCallPhrases` | ["goodbye", ...] | User phrases that trigger automatic call end |

---

## Models Used (Default by VAPI)

| Purpose | Model | Provider | You Chose This? |
|---|---|---|---|
| Speech-to-Text | Nova-2 | Deepgram | No (VAPI default) |
| LLM / Reasoning | GPT-4o-mini | OpenAI | Yes (in config) |
| Text-to-Speech | Eleven Multilingual v2 | ElevenLabs | Yes (in config) |
| Embeddings | text-embedding-3-small | OpenAI | Yes (in agent.py) |
| Vector Store | Serverless index | Pinecone | Yes (in agent.py) |

---

## File Structure

```
frontend/
  src/
    config/
      vapiConfig.js          <-- VAPI client + assistant config
    components/
      VoiceModal.jsx          <-- Call UI (idle/connecting/active states)
      VoiceModal.module.css   <-- Call card styling
      Navbar.jsx              <-- Phone icon button to open call modal
  public/
    ring.mp3                  <-- Ringtone played while connecting
  .env.development            <-- VITE_API_URL (ngrok for local), VITE_VAPI_PUBLIC_KEY
  .env.production             <-- VITE_API_URL (production backend URL)

backend/
  app/
    main.py                   <-- /vapi-chat POST endpoint (webhook handler)
    agent.py                  <-- query_rag() function (Pinecone search)
    aayushmaan.md             <-- Source knowledge base document
    prompts.py                <-- System prompts for text/voice chat
```

---

## Local Development Setup

VAPI's servers need to reach your backend (they make the webhook call, not the browser). Since they can't reach `localhost`, you need a tunnel:

```
1. Start backend:     cd backend/app && python main.py
2. Start tunnel:      ngrok http 8000
3. Copy ngrok URL:    https://abc123.ngrok-free.app
4. Set in .env.development:  VITE_API_URL=https://abc123.ngrok-free.app
5. Start frontend:    cd frontend && npm run dev
```

---

## Key Lessons Learned

1. **VAPI webhook format**: VAPI sends `type: "tool-calls"` with `toolCallList` array, NOT `type: "function-call"`. Response must be `{"results": [{"toolCallId": "...", "result": "..."}]}`

2. **serverUrl must be public**: VAPI cloud servers call your backend, not the browser. localhost will never work - use ngrok for local dev.

3. **Speed matters for voice**: RAG queries must return in under 5 seconds or the LLM times out and says "I don't know". Skip expensive LLM routing steps for voice.

4. **VAPI sends ALL events to serverUrl**: Not just tool calls - also speech updates, conversation updates, status changes. Your endpoint should handle `tool-calls` and return `{}` for everything else.

5. **LLM rewrites queries automatically**: When GPT-4o-mini calls `search_knowledge`, it optimizes the user's question into a better search query. You don't need to do query rewriting yourself.

6. **Date awareness via system prompt**: Inject today's date into the system prompt so the LLM uses correct tenses (past vs future).
