import os
import json
import uuid
from contextlib import asynccontextmanager

print("[1/6] Loading FastAPI...")
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import RedirectResponse, FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
print("[2/6] Loading LangChain...")
from langchain_core.messages import AIMessageChunk

print("[3/6] Loading agent...")
from models import ChatRequest
from agent import build_agent, query_rag
print("[4/6] Loading logger...")
from logger import get_logger
print("[5/6] Loading STT...")
from voice.stt import transcribe, load_whisper_model
print("[6/6] Loading TTS...")
from voice.tts import synthesize, AUDIO_DIR
print("All imports done")


logger = get_logger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up — building agent...")
    app.state.agent = build_agent()
    print("Agent ready")
    print("Loading Whisper model...")
    load_whisper_model()
    print("Whisper ready — server is live")
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://aayushmaan-bot.vercel.app", "http://localhost:5173", "https://aayushbot.myddns.me", "*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"server": "I am root"}


@app.get("/health")
def health():
    return {"server": "ok"}


@app.get("/book-call")
async def book_call():
    return RedirectResponse(url="https://calendly.com/aayushmaan162/30min?back=1")


@app.post("/chat")
async def chat(req: ChatRequest):
    agent = app.state.agent
    config = {"configurable": {"thread_id": req.thread_id}}

    async def token_stream():
        async for msg, metadata in agent.astream(
            {"messages": [{"role": "user", "content": req.message}]},
            config=config,
            context={"is_voice": False},
            stream_mode="messages",
        ):
            if isinstance(msg, AIMessageChunk) and msg.content and not msg.tool_calls:
                yield f"data: {json.dumps({'token': msg.content})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        token_stream(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


@app.post("/voice-chat")
async def voice_chat(audio: UploadFile = File(...)):
    temp_path = os.path.join(AUDIO_DIR, f"upload_{uuid.uuid4().hex}.wav")
    with open(temp_path, "wb") as f:
        content = await audio.read()
        f.write(content)

    question = transcribe(temp_path)
    os.remove(temp_path)

    if not question:
        raise HTTPException(status_code=400, detail="Could not transcribe audio. Try again.")

    agent = app.state.agent
    config = {"configurable": {"thread_id": f"voice_{uuid.uuid4().hex[:8]}"}}

    response = await agent.ainvoke(
        {"messages": [{"role": "user", "content": question}]},
        config=config,
        context={"is_voice": True},
    )
    reply = response["messages"][-1].content

    audio_path = await synthesize(reply)
    audio_filename = os.path.basename(audio_path)

    return {"question": question, "reply": reply, "audio_url": f"/audio/{audio_filename}"}


@app.get("/audio/{filename}")
def get_audio(filename: str):
    filepath = os.path.join(AUDIO_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(filepath, media_type="audio/mpeg")

@app.post("/vapi-chat")
async def vapi_chat(request: Request):
    payload = await request.json()
    message = payload.get("message", {})
    msg_type = message.get("type", "")

    if msg_type == "tool-calls":
        tool_calls = message.get("toolCallList", [])
        results = []
        for tc in tool_calls:
            tc_id = tc.get("id", "")
            fn = tc.get("function", {})
            fn_name = fn.get("name", "")
            args = fn.get("arguments", {})
            if isinstance(args, str):
                args = json.loads(args)

            logger.info(f"VAPI tool call: {fn_name}, query: {args}")

            if fn_name == "search_knowledge":
                query = args.get("query", "")
                if query:
                    try:
                        result = query_rag(query)
                        logger.info(f"RAG result length: {len(result)}")
                        results.append({"toolCallId": tc_id, "result": result})
                    except Exception as e:
                        logger.error(f"RAG query failed: {e}")
                        results.append({"toolCallId": tc_id, "result": "Error retrieving information."})
                else:
                    results.append({"toolCallId": tc_id, "result": "No query provided."})
            else:
                results.append({"toolCallId": tc_id, "result": "Unknown function."})

        return {"results": results}

    return {}


if __name__ == "__main__":
    import uvicorn
    from dotenv import load_dotenv

    load_dotenv()
    is_prod = os.getenv("ENV") == "production"
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=not is_prod,
        workers=2 if is_prod else 1,
    )
