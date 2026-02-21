import styles from './ChatArea.module.css'
import profileImg from '../assets/profile.png'

function renderMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    )
}

function TypingIndicator() {
  return (
    <div className={styles.row}>
      <img src={profileImg} alt="Bot" className={styles.botAvatar} />
      <div className={`${styles.bubble} ${styles.bot}`}>
        <div className={styles.typing}>
          <span /><span /><span />
        </div>
      </div>
    </div>
  )
}

export default function ChatArea({ messages, loading, chatEndRef }) {
  return (
    <div className={styles.chat}>
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`${styles.row} ${msg.role === 'user' ? styles.userRow : ''}`}
        >
          {msg.role === 'assistant' && (
            <img src={profileImg} alt="Bot" className={styles.botAvatar} />
          )}
          <div
            className={`${styles.bubble} ${
              msg.role === 'user' ? styles.user : styles.bot
            }`}
            {...(msg.role === 'assistant'
              ? { dangerouslySetInnerHTML: { __html: renderMarkdown(msg.content) } }
              : { children: msg.content }
            )}
          />
        </div>
      ))}
      {loading && <TypingIndicator />}
      <div ref={chatEndRef} />
    </div>
  )
}
