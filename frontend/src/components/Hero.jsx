import { useState, useEffect } from 'react'
import styles from './Hero.module.css'
import profileImg from '../assets/profile.png'

const GREETINGS = [
  { greeting: "Hello, I'm", name: "Aayushmaan", subtitle: "Ask me anything" },
  { greeting: "नमस्ते, मैं हूँ", name: "आयुष्मान", subtitle: "मुझसे कुछ भी पूछो" },
  // { greeting: "你好，我是", name: "阿尤什曼", subtitle: "随便问我什么" },
  // { greeting: "Hola, soy", name: "Aayushmaan", subtitle: "Pregúntame lo que quieras" },
]

export default function Hero({ quickQuestions, onQuestionClick }) {
  const [index, setIndex] = useState(0)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setAnimating(true)
      setTimeout(() => {
        setIndex(prev => (prev + 1) % GREETINGS.length)
        setAnimating(false)
      }, 300)
    }, 3500)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className={styles.hero}>
      <div className={styles.card}>
        <div className={styles.avatarLarge}>
          <img src={profileImg} alt="Aayushmaan" className={styles.avatarImg} />
        </div>
        <div className={styles.textBlock}>
          <h1 className={styles.heading}>
            <span className={`${styles.greeting} ${animating ? styles.fadeOut : styles.fadeIn}`}>
              {GREETINGS[index].greeting}
            </span>{' '}
            <span className={`${styles.accent} ${styles.greeting} ${animating ? styles.fadeOut : styles.fadeIn}`}>
              {GREETINGS[index].name}
            </span>
          </h1>
          <p className={`${styles.subtitle} ${styles.greeting} ${animating ? styles.fadeOut : styles.fadeIn}`}>
            {GREETINGS[index].subtitle}
          </p>
        </div>
        <div className={styles.chips}>
          {quickQuestions.map(q => (
            <button
              key={q}
              className={styles.chip}
              onClick={() => onQuestionClick(q)}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
