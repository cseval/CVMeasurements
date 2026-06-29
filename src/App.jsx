import { useState, useCallback } from 'react'
import Camera from './components/Camera.jsx'
import Results from './components/Results.jsx'
import Instructions from './components/Instructions.jsx'
import AthleteSelect from './components/AthleteSelect.jsx'
import AdditionalInfo from './components/AdditionalInfo.jsx'
import './App.css'

export default function App() {
  const [screen,     setScreen]   = useState('instructions')
  const [processing, setProcessing] = useState(false)
  const [results,    setResults]  = useState(null)
  const [error,      setError]    = useState(null)
  const [athlete,    setAthlete]  = useState(null)  // {id, first_name, last_name, existing}
  const [markerSize, setMarkerSize] = useState(20)
  const [rowId,      setRowId]    = useState(null)

  const handleCapture = useCallback(async (blob) => {
    setProcessing(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('image', blob, blob.name || 'capture.jpg')
      formData.append('marker_cm', markerSize)
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/measure`, { method: 'POST', body: formData })
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
  }, [markerSize])

  const handleRetry = useCallback(() => {
    setResults(null)
    setError(null)
    setScreen('camera')
  }, [])

  const handleContinueToAdditional = useCallback((id) => {
    setRowId(id)
    setScreen('additional')
  }, [])

  const handleAdditionalDone = useCallback(() => {
    setResults(null)
    setError(null)
    setAthlete(null)
    setRowId(null)
    setScreen('athlete')
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
    return <AthleteSelect onSelect={handleAthleteSelect} onBack={() => setScreen('instructions')} />
  }
  if (screen === 'camera') {
    return <Camera onCapture={handleCapture} onBack={() => setScreen('athlete')} disabled={processing} />
  }
  if (screen === 'additional') {
    return (
      <AdditionalInfo
        rowId={rowId}
        athlete={athlete}
        onDone={handleAdditionalDone}
      />
    )
  }
  return (
    <Results
      results={results}
      error={error}
      warnings={results?.warnings}
      athlete={athlete}
      onRetry={handleRetry}
      onContinue={handleContinueToAdditional}
    />
  )
}
