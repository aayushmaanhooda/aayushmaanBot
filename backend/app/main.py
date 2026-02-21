from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware

from models import ChatRequest
from agent import build_agent
from logger import get_logger


logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.agent = build_agent()
    logger.info("Agent loaded and ready")
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
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
    )

    ai_message = response["messages"][-1]
    # logger.info(f"aayushbot reply", {ai_message})
    return {"reply": ai_message.content, "thread_id": req.thread_id}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="localhost", port=8000, reload=True)
