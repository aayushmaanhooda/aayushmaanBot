import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware

from models import ChatRequest
from agent import build_agent
from logger import get_logger
from voice.stt import transcribe, load_whisper_model
from voice.tts import synthesize, AUDIO_DIR


logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.agent = build_agent()
    logger.info("Agent loaded and ready")
    load_whisper_model()
    logger.info("Whisper model loaded and ready")
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://aayushmaan-bot.vercel.app", "http://localhost:5173", "https://aayushbot.myddns.me"],
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

    response = await agent.ainvoke(
        {"messages": [{"role": "user", "content": req.message}]},
        config=config,
        context={"is_voice": False},
    )

    ai_message = response["messages"][-1]
    return {"reply": ai_message.content, "thread_id": req.thread_id}


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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
