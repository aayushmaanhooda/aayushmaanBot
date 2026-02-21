import { useState, useRef, useEffect } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import ChatArea from './components/ChatArea'
import InputBar from './components/InputBar'
import './App.module.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const QUICK_ANSWERS = {
  "What's your tech stack?": "My go-to stack is Python for everything — FastAPI and Flask on the backend, LangChain and LangGraph for AI orchestration, and Pinecone for vector storage. For infra I use Docker, GitHub Actions, and AWS. Streamlit when I need a quick AI frontend. Basically if it involves Python and AI, I'm in.",

  "Tell me about your AI projects": "I've built a bunch of things — a Voice RAG app where you literally speak a question and get a voice response back, a Leave Manager MCP Server using FastMCP and Claude Desktop, a multi-agent Resume Selector with CrewAI, and a full RAG evaluation framework using RAGAS. Most of them have a Medium article attached too. You can explore everything on my GitHub: https://github.com/aayushmaanhooda",

  "What's your work experience?": "Started my career as an Associate Software Engineer at Annalect in Gurugram for about 2 years — mostly Flask microservices and OpenAPI integrations with a US-based team. Then moved to Sydney for my Master's at UNSW and picked up an internship at Stoik working on FastAPI and MongoDB. Since finishing my Master's in September 2025 I've been fully focused on Applied AI and building agentic systems.",

  "What are your hobbies and interests?": "Outside of work — gym is a big part of my routine, keeps me disciplined. I play table tennis occasionally, which actually goes back to competing at national level in India. Big F1 fan — Kimi and Max all the way. Cricket too, being from India that one's non-negotiable. I'm also planning to learn piano and get into DJing, so watch this space.",
  "Let's schedule a call": 'Sure, would love to chat! Click the button below to book a 30-min call with me 👉 <a href="http://localhost:8000/book-call" target="_blank" rel="noopener noreferrer">Book a Call</a>',
}

const QUICK_QUESTIONS = Object.keys(QUICK_ANSWERS)

function generateThreadId() {
  return 'thread_' + Math.random().toString(36).substring(2, 10)
}

function getInitialTheme() {
  const saved = localStorage.getItem('theme')
  if (saved) return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [threadId] = useState(generateThreadId)
  const [theme, setTheme] = useState(getInitialTheme)
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  const [usedQuestions, setUsedQuestions] = useState([])
  const hasStarted = messages.length > 0
  const remainingQuestions = QUICK_QUESTIONS.filter(q => !usedQuestions.includes(q))

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text) {
    if (!text.trim() || loading) return

    const userMsg = { role: 'user', content: text.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), thread_id: threadId }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: "Hmm, something went wrong. Try again?" },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    sendMessage(input)
  }

  function handleQuickQuestion(q) {
    if (loading) return
    setUsedQuestions(prev => [...prev, q])
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setLoading(true)

    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', content: QUICK_ANSWERS[q] }])
      setLoading(false)
    }, 1000)
  }

  return (
    <div className="app">
      <Navbar theme={theme} onToggleTheme={toggleTheme} onLogoClick={() => { setMessages([]); setUsedQuestions([]) }} />
      <main className="main">
        {!hasStarted ? (
          <Hero
            quickQuestions={QUICK_QUESTIONS}
            onQuestionClick={handleQuickQuestion}
          />
        ) : (
          <ChatArea
            messages={messages}
            loading={loading}
            chatEndRef={chatEndRef}
          />
        )}
      </main>
      <InputBar
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        loading={loading}
        inputRef={inputRef}
        suggestions={hasStarted ? remainingQuestions : []}
        onSuggestionClick={handleQuickQuestion}
      />
    </div>
  )
}
