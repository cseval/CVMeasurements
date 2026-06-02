import { useState, useEffect, useCallback } from 'react'

export default function AthleteSelect({ onSelect }) {
  const [query,    setQuery]   = useState('')
  const [results,  setResults] = useState([])
  const [loading,  setLoading] = useState(false)
  const [error,    setError]   = useState(null)

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/athletes?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data)
    } catch {
      setError('Could not load athletes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  async function handleSelect(athlete) {
    try {
      const res    = await fetch(`/api/athletes/${athlete.id}/status`)
      const status = await res.json()
      onSelect({ ...athlete, status })
    } catch {
      onSelect({ ...athlete, status: { exists: false, has_data: false, row_id: null } })
    }
  }

  return (
    <div className="athlete-screen">
      <div className="athlete-header">
        <h1>Select Athlete</h1>
        <p className="instructions-sub">Search by first or last name</p>
      </div>

      <div className="athlete-body">
        <input
          className="athlete-search"
          type="text"
          placeholder="Search athletes…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />

        {error && <div className="error-card">{error}</div>}

        {loading && <p className="athlete-hint">Searching…</p>}

        {!loading && results.length === 0 && query.trim() && (
          <p className="athlete-hint">No athletes found</p>
        )}

        <div className="athlete-list">
          {results.map(a => (
            <button
              key={a.id}
              className="athlete-row"
              onClick={() => handleSelect(a)}
            >
              <span className="athlete-name">
                {a.first_name} {a.last_name}
              </span>
              <span className="athlete-id">#{a.id}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
