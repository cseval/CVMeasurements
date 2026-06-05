import { useState, useCallback } from 'react'
import Camera from './components/Camera.jsx'
import Results from './components/Results.jsx'
import Instructions from './components/Instructions.jsx'
import AthleteSelect from './components/AthleteSelect.jsx'
import './App.css'

export default function App() {
  const [screen,     setScreen]   = useState('instructions')
  const [processing, setProcessing] = useState(false)
  const [results,    setResults]  = useState(null)
  const [error,      setError]    = useState(null)
  const [athlete,    setAthlete]  = useState(null)  // {id, first_name, last_name, existing}
  const [markerSize, setMarkerSize] = useState(20)

  const handleCapture = useCallback(async (blob) => {
    setProcessing(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('image', blob, 'capture.jpg')
      formData.append('marker_cm', markerSize)
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

  const handleAthleteSelect = useCallback((selected, size) => {
    setAthlete(selected)
    setMarkerSize(size)
    setScreen('camera')
  }, [])

  if (screen === 'instructions') {
    return <Instructions onStart={() => setScreen('athlete')} />
  }
  if (screen === 'athlete') {
    return <AthleteSelect onSelect={handleAthleteSelect} />
  }
  if (screen === 'camera') {
    return <Camera onCapture={handleCapture} disabled={processing} />
  }
  return (
    <Results
      results={results}
      error={error}
      warnings={results?.warnings}
      athlete={athlete}
      onRetry={handleRetry}
    />
  )
}
