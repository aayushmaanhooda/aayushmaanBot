import { useState, useRef, useCallback, useEffect } from 'react'
import styles from './VoiceModal.module.css'

const BAR_COUNT = 50
const API_URL = import.meta.env.VITE_API_URL

export default function VoiceModal({ onClose }) {
  const [phase, setPhase] = useState('idle') // idle | recording | processing | speaking
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const audioRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceCreatedRef = useRef(false)
  const animFrameRef = useRef(null)
  const barsRef = useRef(null)
  const [transcript, setTranscript] = useState('')

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    cancelAnimationFrame(animFrameRef.current)
  }, [])

  useEffect(() => {
    return () => {
      stopPlayback()
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [stopPlayback])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' })
        sendAudio(blob)
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setPhase('recording')
      setTranscript('')
    } catch {
      setTranscript('Mic access denied. Check permissions.')
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setPhase('processing')
  }

  function toggleRecording() {
    if (phase === 'recording') {
      stopRecording()
    } else if (phase === 'idle') {
      startRecording()
    }
  }

  async function sendAudio(blob) {
    const formData = new FormData()
    formData.append('audio', blob, 'recording.wav')

    try {
      const res = await fetch(`${API_URL}/voice-chat`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Something went wrong')

      setTranscript(data.question)
      setPhase('speaking')
      playWithWaveform(`${API_URL}${data.audio_url}`)
    } catch (err) {
      setTranscript('Error: ' + err.message)
      setPhase('idle')
    }
  }

  function playWithWaveform(url) {
    const audio = audioRef.current
    audio.src = url
    audio.crossOrigin = 'anonymous'

    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || window['webkitAudioContext']
      const ctx = new AudioCtx()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.8
      audioContextRef.current = ctx
      analyserRef.current = analyser
    }

    if (!sourceCreatedRef.current) {
      const source = audioContextRef.current.createMediaElementSource(audio)
      source.connect(analyserRef.current)
      analyserRef.current.connect(audioContextRef.current.destination)
      sourceCreatedRef.current = true
    }

    audioContextRef.current.resume()
    visualize()
    audio.play()

    audio.onended = () => {
      cancelAnimationFrame(animFrameRef.current)
      if (barsRef.current) {
        Array.from(barsRef.current.children).forEach(bar => {
          bar.style.height = '4px'
        })
      }
      setPhase('idle')
    }
  }

  function visualize() {
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)
    const bars = barsRef.current?.children

    if (bars) {
      for (let i = 0; i < BAR_COUNT; i++) {
        const idx = Math.floor((i / BAR_COUNT) * dataArray.length)
        const value = dataArray[idx]
        const height = Math.max(4, (value / 255) * 65)
        bars[i].style.height = `${height}px`
        bars[i].style.opacity = `${0.3 + (value / 255) * 0.7}`
      }
    }

    animFrameRef.current = requestAnimationFrame(visualize)
  }

  const statusText = {
    idle: 'Press the mic to speak',
    recording: 'Listening... tap again to stop',
    processing: 'Thinking...',
    speaking: 'Speaking...',
  }

  return (
    <div className={styles.overlay}>
      <button className={styles.close} onClick={onClose} aria-label="Close">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Voice Assistant (Beta)</h2>
          <p className={styles.subtitle}>Talk to Aayushmaan's digital twin</p>
        </div>

        <div className={`${styles.micWrapper} ${styles[phase]}`}>
          <div className={styles.micRing} />
          <button
            className={styles.micBtn}
            onClick={toggleRecording}
            disabled={phase === 'processing' || phase === 'speaking'}
          >
            {phase === 'recording' ? (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
        </div>

        <p className={`${styles.status} ${styles[phase]}`}>
          {statusText[phase]}
        </p>

        {transcript && (
          <p className={styles.transcript}>"{transcript}"</p>
        )}

        <div
          ref={barsRef}
          className={`${styles.waveform} ${phase === 'speaking' ? styles.waveformActive : ''}`}
        >
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            <div key={i} className={styles.bar} />
          ))}
        </div>

        <audio ref={audioRef} style={{ display: 'none' }} />

        <p className={styles.footer}>faster-whisper + langchain + edge-tts</p>
      </div>
    </div>
  )
}
