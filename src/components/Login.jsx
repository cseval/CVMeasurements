import { useState } from 'react'
import BrandBar from './BrandBar.jsx'

export default function Login({ onSuccess }) {
  const [passphrase, setPassphrase] = useState('')
  const [error,      setError]      = useState(null)
  const [loading,    setLoading]    = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!passphrase.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ passphrase }),
      })
      if (!res.ok) {
        setError('Incorrect access code. Please try again.')
        return
      }
      onSuccess()
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <BrandBar />
      <div className="login-body">
        <div className="login-card">
          <h1 className="login-title">CSE Measurements</h1>
          <p className="login-subtitle">Enter your access code to continue</p>
          <form onSubmit={handleSubmit} className="login-form">
            <input
              className="form-input"
              type="password"
              placeholder="Access code"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              autoFocus
              disabled={loading}
              autoComplete="current-password"
            />
            {error && (
              <div className="error-card" style={{ fontSize: 13 }}>{error}</div>
            )}
            <button
              className="retry-btn"
              type="submit"
              disabled={loading || !passphrase.trim()}
            >
              {loading ? 'Verifying…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
