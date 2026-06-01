import { useState, useCallback } from 'react'
import Camera from './components/Camera.jsx'
import Results from './components/Results.jsx'
import Instructions from './components/Instructions.jsx'
import './App.css'

export default function App() {
  const [processing, setProcessing] = useState(false)
  const [screen,     setScreen]     = useState('instructions')
  const [results,    setResults]    = useState(null)
  const [error,      setError]      = useState(null)

  const handleCapture = useCallback(async (blob) => {
    setProcessing(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('image', blob, 'capture.jpg')
      const res = await fetch('/api/measure', { method: 'POST', body: formData })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Server error ${res.status}`)
      }
      const data = await res.json()
      setResults(data)
      setScreen('results')
    } catch (err) {
      setError(err.message)
      setScreen('results')
    } finally {
      setProcessing(false)
    }
  }, [])

  const handleRetry = useCallback(() => {
    setResults(null)
    setError(null)
    setScreen('camera')
  }, [])

  if (screen === 'instructions') {
    return <Instructions onStart={() => setScreen('camera')} />
  }
  if (screen === 'camera') {
    return <Camera onCapture={handleCapture} disabled={processing} />
  }
  return <Results results={results} error={error} warnings={results?.warnings} onRetry={handleRetry} />
}
