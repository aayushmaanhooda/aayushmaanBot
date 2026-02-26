import { useState, useEffect, useRef } from 'react'
import profileImg from '../assets/profile.png'
import { vapi, buildAssistantConfig } from '../config/vapiConfig'
import styles from './VoiceModal.module.css'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function VoiceModal({ onClose }) {
  const [callStatus, setCallStatus] = useState('idle')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const ringAudioRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const audio = new Audio('/ring.mp3')
    audio.loop = true
    ringAudioRef.current = audio
    return () => {
      audio.pause()
      audio.currentTime = 0
    }
  }, [])

  useEffect(() => {
    const audio = ringAudioRef.current
    if (!audio) return

    if (callStatus === 'connecting') {
      audio.currentTime = 0
      audio.play().catch(() => {})
    } else {
      audio.pause()
      audio.currentTime = 0
    }
  }, [callStatus])

  useEffect(() => {
    if (callStatus === 'active') {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [callStatus])

  useEffect(() => {
    vapi.on('call-start', () => setCallStatus('active'))

    vapi.on('call-end', () => {
      setCallStatus('idle')
      setIsSpeaking(false)
    })

    vapi.on('speech-start', () => setIsSpeaking(true))
    vapi.on('speech-end', () => setIsSpeaking(false))

    vapi.on('error', (error) => {
      console.error('Vapi error:', error)
      setCallStatus('idle')
    })

    return () => vapi.removeAllListeners()
  }, [])

  const startCall = async () => {
    setCallStatus('connecting')
    try {
      await vapi.start(buildAssistantConfig())
    } catch (err) {
      console.error('Failed to start call:', err)
      setCallStatus('idle')
    }
  }

  const endCall = () => {
    vapi.stop()
    setCallStatus('idle')
  }

  const handleClose = () => {
    if (callStatus !== 'idle') endCall()
    onClose()
  }

  const isInCall = callStatus === 'connecting' || callStatus === 'active'

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className={styles.callerInfo}>
          <div className={`${styles.avatarRing} ${isInCall ? styles.avatarRingActive : ''}`}>
            <img src={profileImg} alt="Aayushmaan" className={styles.avatar} />
          </div>
          <h2 className={styles.callerName}>Aayushmaan Hooda</h2>
          <p className={styles.callerRole}>Backend AI Engineer</p>
        </div>

        <div className={styles.statusArea}>
          {callStatus === 'idle' && (
            <p className={styles.statusIdle}>Tap to call</p>
          )}
          {callStatus === 'connecting' && (
            <p className={styles.statusConnecting}>Calling...</p>
          )}
          {callStatus === 'active' && (
            <>
              <p className={styles.timer}>{formatTime(elapsed)}</p>
              <div className={styles.liveIndicator}>
                <span className={`${styles.dot} ${isSpeaking ? styles.dotSpeaking : ''}`} />
                <span className={styles.liveText}>
                  {isSpeaking ? 'Speaking' : 'Listening'}
                </span>
              </div>
            </>
          )}
        </div>

        <div className={styles.controls}>
          {callStatus === 'idle' && (
            <button className={styles.callBtn} onClick={startCall} aria-label="Start call">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
              </svg>
            </button>
          )}
          {isInCall && (
            <button className={styles.endBtn} onClick={endCall} aria-label="End call">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
              </svg>
            </button>
          )}
        </div>

        <p className={styles.footer}>
          <span className={styles.betaTag}>beta</span>
          vapi + rag + 11labs
        </p>
      </div>
    </div>
  )
}
