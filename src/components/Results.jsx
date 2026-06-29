import { useState, useRef } from 'react'
import AdjustCanvas from './AdjustCanvas.jsx'
import BrandBar from './BrandBar.jsx'

function cmToFtIn(cm) {
  const totalInches = cm / 2.54
  const feet = Math.floor(totalInches / 12)
  const inches = Math.round((totalInches % 12) * 10) / 10
  return `${feet}' ${inches}"`
}

function cmToIn(cm) {
  return `${(cm / 2.54).toFixed(1)}"`
}

const LINE_COLORS = { height: '#60a5fa', wingspan: '#f97316', hand: '#c084fc' }
const ENDPOINT_PAIRS = [
  ['height_crown',  'height_heel',   'height'],
  ['wingspan_left', 'wingspan_right', 'wingspan'],
  ['hand_thumb',    'hand_pinky',     'hand'],
]

function compositeAdjusted(debugImageB64, pts, baseScale, imgW, imgH) {
  return new Promise(resolve => {
    const canvas  = document.createElement('canvas')
    canvas.width  = Math.round(imgW * baseScale)
    canvas.height = Math.round(imgH * baseScale)
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      for (const [k1, k2, type] of ENDPOINT_PAIRS) {
        if (!pts[k1] || !pts[k2]) continue
        const color = LINE_COLORS[type]
        ctx.beginPath()
        ctx.moveTo(pts[k1][0], pts[k1][1])
        ctx.lineTo(pts[k2][0], pts[k2][1])
        ctx.strokeStyle = color
        ctx.lineWidth = 4
        ctx.stroke()
        for (const pt of [pts[k1], pts[k2]]) {
          ctx.beginPath()
          ctx.arc(pt[0], pt[1], 5, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.src = `data:image/jpeg;base64,${debugImageB64}`
  })
}

const MANUAL_KEYS = ['height_cm', 'wingspan_cm', 'hand_width_cm']

export default function Results({ results, error, warnings, athlete, rowId, onRetry, onContinue }) {
  const [adjusting, setAdjusting]     = useState(false)
  const [adjustedVals, setAdjusted]   = useState({})
  const [adjustedImage, setAdjImage]  = useState(null)
  const [manualEntry, setManualEntry] = useState(false)
  const [manualDraft, setManualDraft] = useState({})
  const [manualVals, setManualVals]   = useState({})
  const [saveState, setSaveState]     = useState(rowId ? 'updated' : 'idle') // idle | saving | saved | updated | error
  const [savedRowId, setSavedRowId]   = useState(rowId ?? null)
  const canvasRef                     = useRef(null)

  const canAdjust    = !!(results?.endpoints && results?.raw_image)
  const display      = { ...results, ...adjustedVals, ...manualVals }
  const hasManualVals = Object.keys(manualVals).length > 0
  const showFailure  = !!error && !manualEntry && !hasManualVals

  function handleAdjustChange(updated) {
    setAdjusted(prev => ({ ...prev, ...updated }))
    // Dragging a line re-derives these measurements from the photo, so that
    // should win over any earlier manual entry for the same keys.
    setManualVals(prev => {
      const next = { ...prev }
      for (const key of Object.keys(updated)) delete next[key]
      return next
    })
    // A correction after a save needs to be re-saved, so re-arm the Save button.
    setSaveState(prev => (prev === 'saved' || prev === 'updated') ? 'idle' : prev)
  }

  function openManualEntry() {
    setManualDraft({
      height_cm:     display.height_cm     ?? '',
      wingspan_cm:   display.wingspan_cm   ?? '',
      hand_width_cm: display.hand_width_cm ?? '',
    })
    setManualEntry(true)
  }

  function handleManualChange(key, raw) {
    setManualDraft(prev => ({ ...prev, [key]: raw }))
  }

  function handleManualApply() {
    const next = {}
    for (const key of MANUAL_KEYS) {
      const parsed = parseFloat(manualDraft[key])
      if (!isNaN(parsed) && parsed > 0) next[key] = Math.round(parsed * 10) / 10
    }
    setManualVals(next)
    setManualEntry(false)
    // A correction after a save needs to be re-saved, so re-arm the Save button.
    setSaveState(prev => (prev === 'saved' || prev === 'updated') ? 'idle' : prev)
  }

  function handleManualCancel() {
    setManualEntry(false)
  }

  async function handleDone() {
    setAdjusting(false)
    const state = canvasRef.current?.getState()
    if (state && results?.debug_image) {
      const dataUrl = await compositeAdjusted(
        results.debug_image,
        state.pts,
        state.baseScale,
        results.img_width,
        results.img_height,
      )
      setAdjImage(dataUrl)
    }
  }

  async function handleSave() {
    if (!athlete || !display.height_cm || !display.wingspan_cm || !display.hand_width_cm) return
    setSaveState('saving')
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id:     athlete.id,
          first_name:    athlete.first_name,
          last_name:     athlete.last_name,
          height_cm:     display.height_cm,
          wingspan_cm:   display.wingspan_cm,
          hand_width_cm: display.hand_width_cm,
          event_id:      athlete.event_id ?? null,
          user_id:       athlete.user_id ?? null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Server error ${res.status}`)
      }
      const data = await res.json()
      setSavedRowId(data.id)
      setSaveState(data.action === 'updated' ? 'updated' : 'saved')
    } catch (err) {
      setSaveState('error')
    }
  }

  function saveLabel() {
    if (!athlete?.status) return 'Save Measurements'
    if (!athlete.status.exists)   return 'Save Measurements'
    if (!athlete.status.has_data) return 'Add Measurements'
    return 'Update Measurements'
  }

  const measurements = [
    { key: 'height_cm',     label: 'Height',    cls: 'height',   imperial: v => cmToFtIn(v) },
    { key: 'wingspan_cm',   label: 'Wingspan',  cls: 'wingspan', imperial: v => cmToFtIn(v) },
    { key: 'hand_width_cm', label: 'Hand Span', cls: 'hand',     imperial: v => cmToIn(v)   },
  ]

  const isAdjusted = key => key in adjustedVals || key in manualVals

  return (
    <div className="results-screen">
      <BrandBar />
      <div className="results-header">
        <h1>
          {adjusting ? 'Adjust Lines' : manualEntry ? 'Enter Measurements' : showFailure ? 'Measurement Failed' : 'Measurements'}
        </h1>
        {adjusting && (
          <button className="done-btn" onClick={handleDone}>Done</button>
        )}
        {manualEntry && (
          <button className="done-btn" onClick={handleManualApply}>Apply</button>
        )}
      </div>

      <div className="results-body">
        {showFailure ? (
          <div className="error-card">{error}</div>
        ) : (
          <>
            {warnings?.map((w, i) => (
              <div key={i} className="error-card" style={{ fontSize: 13 }}>{w}</div>
            ))}

            {results?.debug_image && !adjusting && (
              <img
                src={adjustedImage || `data:image/jpeg;base64,${results.debug_image}`}
                alt="Annotated measurement"
                style={{ width: '100%', borderRadius: 8, marginBottom: 4 }}
              />
            )}

            {adjusting && (
              <div style={{ marginBottom: 8 }}>
                <p className="adjust-hint">Drag dots · Pinch or scroll to zoom · Double-tap to reset</p>
                <AdjustCanvas
                  ref={canvasRef}
                  rawImage={results.raw_image}
                  endpoints={results.endpoints}
                  pxPerCm={results.px_per_cm}
                  imgWidth={results.img_width}
                  imgHeight={results.img_height}
                  onChange={handleAdjustChange}
                />
              </div>
            )}

            {manualEntry && (
              <p className="manual-entry-hint">
                Enter measurements directly if the camera isn't available or the detected values look wrong.
              </p>
            )}

            {measurements.map(({ key, label, cls, imperial }) => {
              if (manualEntry) {
                const draftVal = parseFloat(manualDraft[key])
                const liveImperial = !isNaN(draftVal) && draftVal > 0 ? imperial(draftVal) : 'cm'
                return (
                  <div key={key} className={`measurement-card ${cls}`}>
                    <span className="label">{label}</span>
                    <span className="value-group">
                      <input
                        className="measurement-input"
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        placeholder="—"
                        value={manualDraft[key]}
                        onChange={e => handleManualChange(key, e.target.value)}
                      />
                      <span className="value-imperial">{liveImperial}</span>
                    </span>
                  </div>
                )
              }
              const val = display?.[key]
              const adjusted = isAdjusted(key)
              return (
                <div key={key} className={`measurement-card ${val != null ? cls : 'missing'}`}>
                  <span className="label">
                    {label}
                    {adjusted && <span className="adjusted-dot" title="Manually adjusted" />}
                  </span>
                  <span className="value-group">
                    <span className="value">{val != null ? `${val} cm` : '—'}</span>
                    {val != null && <span className="value-imperial">{imperial(val)}</span>}
                  </span>
                </div>
              )
            })}

            {results?.px_per_cm && !manualEntry && (
              <p className="scale-note">Scale: {results.px_per_cm} px / cm</p>
            )}
          </>
        )}
      </div>

      <div className="results-footer">
        {showFailure ? (
          <>
            <button className="retry-btn" onClick={onRetry}>Try Again</button>
            <button className="adjust-btn" onClick={openManualEntry}>Enter Manually</button>
          </>
        ) : manualEntry ? (
          <button className="adjust-btn" onClick={handleManualCancel}>Cancel</button>
        ) : (
          <>
            {athlete && !adjusting && (
              <div className="athlete-banner">
                {athlete.first_name} {athlete.last_name}
              </div>
            )}

            {athlete && !adjusting && saveState === 'idle' && (
              <button
                className="retry-btn"
                onClick={handleSave}
                disabled={!display.height_cm || !display.wingspan_cm || !display.hand_width_cm}
              >
                {saveLabel()}
              </button>
            )}

            {saveState === 'saving' && (
              <button className="retry-btn" disabled>Saving…</button>
            )}

            {(saveState === 'saved' || saveState === 'updated') && (
              <>
                <div className="save-success">
                  {saveState === 'updated' ? 'Measurements updated' : 'Measurements saved'}
                </div>
                {onContinue && (
                  <button className="retry-btn" onClick={() => onContinue(savedRowId, display)}>
                    Add Additional Info
                  </button>
                )}
              </>
            )}

            {saveState === 'error' && (
              <div className="error-card" style={{ fontSize: 13 }}>
                Save failed — check connection and try again
              </div>
            )}

            {canAdjust && !adjusting && (
              <button className="adjust-btn" onClick={() => setAdjusting(true)}>
                Adjust Lines
              </button>
            )}
            {!adjusting && (
              <button className="adjust-btn" onClick={openManualEntry}>
                Enter Manually
              </button>
            )}
            <button className="retry-btn" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} onClick={onRetry}>
              Measure Again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
