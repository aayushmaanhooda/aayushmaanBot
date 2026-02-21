import styles from './InputBar.module.css'

export default function InputBar({ value, onChange, onSubmit, loading, inputRef, suggestions = [], onSuggestionClick }) {
  return (
    <div className={styles.wrapper}>
      {suggestions.length > 0 && (
        <div className={styles.suggestions}>
          {suggestions.map(q => (
            <button
              key={q}
              className={styles.suggestion}
              onClick={() => onSuggestionClick(q)}
              disabled={loading}
            >
              {q}
            </button>
          ))}
        </div>
      )}
      <form className={styles.bar} onSubmit={onSubmit}>
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder="Ask me anything..."
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className={styles.send}
          disabled={!value.trim() || loading}
          aria-label="Send"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
      <p className={styles.footer}>&copy; 2026 &bull; POWERED BY AAYUSHMAAN'S AI</p>
    </div>
  )
}
