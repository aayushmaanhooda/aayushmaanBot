import os
import json
import hashlib
from typing import Literal, Optional, List, TypedDict
from datetime import datetime

from dotenv import load_dotenv
from pydantic import BaseModel
from langchain.chat_models import init_chat_model
from langchain.tools import tool
from langchain.agents import create_agent
from langchain.agents.middleware import dynamic_prompt, ModelRequest
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import MarkdownHeaderTextSplitter
from langchain_pinecone import PineconeVectorStore
from langchain_tavily import TavilySearch
from pinecone import Pinecone, ServerlessSpec
from langgraph.checkpoint.memory import InMemorySaver

from prompts import system_prompt, voice_system_prompt

load_dotenv()

DOCS_DIR = os.path.dirname(__file__)
INDEXED_FILE = os.path.join(DOCS_DIR, "indexed_docs.json")
index_name = os.getenv("PINECONE_INDEX_NAME")

_pc_index = None
_vector_store = None
_filter_llm = None
_web_search = None

# ---------------------------------------------------------------------------
# Pinecone + vector store init
# ---------------------------------------------------------------------------


def setup_vector_store():
    global _pc_index, _vector_store, _filter_llm, _web_search

    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    if not pc.has_index(index_name):
        pc.create_index(
            name=index_name,
            dimension=1536,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )

    _pc_index = pc.Index(index_name)
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    _vector_store = PineconeVectorStore(
        index=_pc_index, embedding=embeddings, namespace="aayush-docs"
    )
    _filter_llm = init_chat_model("o3-mini").with_structured_output(Filter)
    _web_search = TavilySearch(max_results=2)


# ---------------------------------------------------------------------------
# Document indexing helpers
# ---------------------------------------------------------------------------


def _get_file_hash(path: str) -> str:
    return hashlib.md5(open(path, "rb").read()).hexdigest()


def _is_already_indexed(filename: str, file_hash: str) -> bool:
    if not os.path.exists(INDEXED_FILE):
        return False
    db = json.load(open(INDEXED_FILE))
    return db.get(filename) == file_hash


def _is_pinecone_empty() -> bool:
    stats = _pc_index.describe_index_stats()
    return stats["total_vector_count"] == 0


def _mark_indexed(filename: str, file_hash: str) -> None:
    db = json.load(open(INDEXED_FILE)) if os.path.exists(INDEXED_FILE) else {}
    db[filename] = file_hash
    json.dump(db, open(INDEXED_FILE, "w"))


def index_documents():
    filename = "aayushmaan.md"
    filepath = os.path.join(DOCS_DIR, filename)
    file_hash = _get_file_hash(filepath)

    if _is_already_indexed(filename, file_hash):
        print("Already indexed, skipping")
        return

    headers_to_split_on = [
        ("##", "section"),
        ("###", "subsection"),
    ]
    splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers_to_split_on)

    with open(filepath, "r") as f:
        md_text = f.read()

    chunks = splitter.split_text(md_text)

    if _is_pinecone_empty():
        _vector_store.add_documents(chunks)
        _mark_indexed(filename, file_hash)
        print(f"Indexed {len(chunks)} chunks")
    else:
        _mark_indexed(filename, file_hash)
        total = _pc_index.describe_index_stats()["total_vector_count"]
        print(f"Pinecone already has data ({total} vectors), skipping upsert")


# ---------------------------------------------------------------------------
# Metadata filter (structured routing)
# ---------------------------------------------------------------------------


class Filter(BaseModel):
    sections: List[Literal[
        "Projects", "Technical Skills", "Work Experience",
        "Education", "Frequently Asked Questions (for RAG)",
        "Recruiter FAQ — AI & Applied AI Experience",
        "Life Journey (Timeline)", "Family", "Sports Achievements"
    ]]
    subsection: Optional[str] = None


def get_filter(query: str) -> Filter:
    return _filter_llm.invoke(f"""
You are a routing assistant for a personal knowledge base about Aayushmaan Hooda.

Given this query: "{query}"

Pick one or more relevant sections. Pick subsection only if the query is very specific.

Available sections:
- Projects
- Technical Skills
- Work Experience
- Education
- Frequently Asked Questions (for RAG)
- Recruiter FAQ — AI & Applied AI Experience
- Life Journey (Timeline)
- Family
- Sports Achievements
""")


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@tool
def rag_tool(query: str):
    "This is retriever tool, retrieve all info about aayushmaan for this tool"
    result = get_filter(query)

    search_filter = {"section": {"$in": result.sections}}
    if result.subsection:
        search_filter["subsection"] = result.subsection

    retrieved_docs = _vector_store.similarity_search(
        query,
        k=3,
        filter=search_filter,
    )
    serialized = "\n\n".join(
        f"Source: {doc.metadata}\nContent: {doc.page_content}"
        for doc in retrieved_docs
    )
    return serialized, retrieved_docs


@tool
def web_search_tool(query: str) -> str:
    """
    Use this tool to search the web when the user asks about current events,
    news, or things not in the local knowledge.
    Input: query (str) - the search term.
    Output: short text with titles and urls of results.
    """
    res = _web_search.invoke({"query": query})
    return res["results"]


@tool
def age_calculator() -> str:
    """
    Use when age is asked
    Calculate age from a hardcoded date of birth (30 August 1999).
    Returns the current age as an integer of aayushmaan.
    """
    dob = datetime(1999, 8, 30)
    today = datetime.now()
    age = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        age -= 1
    return f"Current age: {age} years old (DOB: 30 August 1999)"


@tool
def calendar_tool(query: str) -> str:
    """
    Use this tool for any date/time/calendar related questions.
    Provides current date, time, day of week, and can calculate
    days between dates or upcoming events.
    """
    now = datetime.now()
    return (
        f"Current date: {now.strftime('%A, %d %B %Y')}\n"
        f"Current time: {now.strftime('%I:%M %p')}\n"
        f"Day of week: {now.strftime('%A')}\n"
        f"Week number: {now.strftime('%W')}"
    )


# ---------------------------------------------------------------------------
# Dynamic prompt middleware
# ---------------------------------------------------------------------------


class AgentContext(TypedDict):
    is_voice: bool


@dynamic_prompt
def switch_prompt(request: ModelRequest) -> str:
    is_voice = request.runtime.context.get("is_voice", False)
    return voice_system_prompt if is_voice else system_prompt


# ---------------------------------------------------------------------------
# Build the agent — called once from FastAPI lifespan
# ---------------------------------------------------------------------------


def build_agent():
    setup_vector_store()
    index_documents()

    tools = [rag_tool, web_search_tool, age_calculator, calendar_tool]
    llm = init_chat_model("gpt-4o")
    checkpointer = InMemorySaver()

    return create_agent(
        llm,
        tools,
        middleware=[switch_prompt],
        context_schema=AgentContext,
        checkpointer=checkpointer,
    )
