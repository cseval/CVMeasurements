import { useState, useEffect, useCallback } from 'react'
import BrandBar from './BrandBar.jsx'

const MARKER_SIZES = [12, 16, 20]

export default function AthleteSelect({ onSelect, onBack }) {
  const [query,         setQuery]         = useState('')
  const [events,        setEvents]        = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [roster,        setRoster]        = useState([])
  const [loading,       setLoading]       = useState(false)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [error,         setError]         = useState(null)
  const [markerSize,    setMarkerSize]    = useState(20)

  const searchEvents = useCallback(async (q) => {
    if (!q.trim()) { setEvents([]); return }
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`${import.meta.env.VITE_API_URL}/api/events?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setEvents(data)
    } catch {
      setError('Could not load events')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => searchEvents(query), 300)
    return () => clearTimeout(t)
  }, [query, searchEvents])

  async function handleEventSelect(event) {
    setSelectedEvent(event)
    setRoster([])
    setRosterLoading(true)
    setError(null)
    try {
      const res  = await fetch(`${import.meta.env.VITE_API_URL}/api/events/${event.id}/roster`)
      const data = await res.json()
      setRoster(data)
    } catch {
      setError('Could not load roster')
    } finally {
      setRosterLoading(false)
    }
  }

  function handlePrintMarker() {
    // A PDF's page size IS the marker's physical size, so printing at
    // "Actual size" in the browser's PDF viewer is exact. Printing an HTML
    // page sized with CSS units is not reliable -- printer drivers can
    // rescale it regardless of the print dialog's stated scale.
    window.open(`${import.meta.env.VITE_API_URL}/api/marker/${markerSize}/pdf`, '_blank')
  }

  function handleChangeEvent() {
    setSelectedEvent(null)
    setRoster([])
  }

  async function handlePlayerSelect(player) {
    try {
      const res    = await fetch(`${import.meta.env.VITE_API_URL}/api/athletes/${player.id}/status`)
      const status = await res.json()
      onSelect({ ...player, status, event_id: selectedEvent.id }, markerSize)
    } catch {
      onSelect({ ...player, status: { exists: false, has_data: false, row_id: null }, event_id: selectedEvent.id }, markerSize)
    }
  }

  return (
    <div className="athlete-screen">
      <BrandBar />
      <div className="athlete-header">
        <button className="header-back-btn" onClick={onBack} aria-label="Back">←</button>
        <h1>Setup</h1>
      </div>

      <div className="athlete-body">

        <div className="setup-step">
          <p className="setup-step-label">Step 1 — Marker size</p>
          <div className="marker-size-row">
            <div className="marker-size-options">
              {MARKER_SIZES.map(s => (
                <button
                  key={s}
                  className={`marker-size-btn${markerSize === s ? ' active' : ''}`}
                  onClick={() => setMarkerSize(s)}
                >
                  {s} cm
                </button>
              ))}
            </div>
            <button className="print-marker-btn" onClick={handlePrintMarker}>
              Print Marker
            </button>
          </div>
          <p className="athlete-hint">
            Opens a PDF in a new tab — print it at "Actual size" (not "Fit to page") for an exact {markerSize} cm marker.
          </p>
        </div>

        <div className="setup-divider" />

        <div className="setup-step">
          <p className="setup-step-label">Step 2 — Search event</p>

          {!selectedEvent ? (
            <>
              <input
                className="athlete-search"
                type="text"
                placeholder="Search by event name…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
              {error && <div className="error-card">{error}</div>}
              {loading && <p className="athlete-hint">Searching…</p>}
              {!loading && events.length === 0 && query.trim() && (
                <p className="athlete-hint">No events found</p>
              )}
              <div className="athlete-list">
                {events.map(e => (
                  <button
                    key={e.id}
                    className="athlete-row"
                    onClick={() => handleEventSelect(e)}
                  >
                    <span className="athlete-name">{e.name}</span>
                    <span className="athlete-id">{e.date}{e.city ? ` · ${e.city}, ${e.state}` : ''}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="event-selected-banner">
              <span className="event-selected-name">{selectedEvent.name}</span>
              <button className="event-change-btn" onClick={handleChangeEvent}>Change</button>
            </div>
          )}
        </div>

        {selectedEvent && (
          <>
            <div className="setup-divider" />
            <div className="setup-step">
              <p className="setup-step-label">Step 3 — Select player</p>
              {error && <div className="error-card">{error}</div>}
              {rosterLoading && <p className="athlete-hint">Loading roster…</p>}
              {!rosterLoading && roster.length === 0 && (
                <p className="athlete-hint">No players found for this event</p>
              )}
              <div className="athlete-list">
                {roster.map(p => (
                  <button
                    key={p.id}
                    className="athlete-row"
                    onClick={() => handlePlayerSelect(p)}
                  >
                    <span className="athlete-name">{p.first_name} {p.last_name}</span>
                    <span className="athlete-id">#{p.id}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="test-mode-divider"><span>or</span></div>
        <button className="test-mode-btn" onClick={() => onSelect(null, markerSize)}>
          Test Mode
        </button>

      </div>
    </div>
  )
}
