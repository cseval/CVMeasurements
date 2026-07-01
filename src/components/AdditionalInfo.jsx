import { useState } from 'react'
import BrandBar from './BrandBar.jsx'

const GROUPS = [
  {
    label: 'General',
    fields: [
      { key: 'age',    display: 'Age'    },
      { key: 'weight', display: 'Weight' },
    ],
  },
  {
    label: 'Hips',
    fields: [
      { key: 'hips_r_hip_er', display: 'R Hip ER' },
      { key: 'hips_r_hip_ir', display: 'R Hip IR' },
      { key: 'hips_l_hip_er', display: 'L Hip ER' },
      { key: 'hips_l_hip_ir', display: 'L Hip IR' },
    ],
  },
  {
    label: 'T-Spine',
    fields: [
      { key: 'tspine_tspine_rot_l', display: 'Rot Left'  },
      { key: 'tspine_tspine_rot_r', display: 'Rot Right' },
    ],
  },
  {
    label: 'Grip Strength',
    fields: [
      { key: 'grip_grip_str_r', display: 'Right' },
      { key: 'grip_grip_str_l', display: 'Left'  },
    ],
  },
]

export default function AdditionalInfo({ rowId, athlete, onDone, onBack, onUnauthorized }) {
  const [values, setValues]     = useState({})
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error

  function handleChange(key, raw) {
    const val = raw === '' ? undefined : parseInt(raw, 10)
    setValues(prev => ({ ...prev, [key]: isNaN(val) ? undefined : val }))
  }

  async function handleSubmit() {
    setSaveState('saving')
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/save_additional`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ row_id: rowId, ...values }),
      })
      if (res.status === 401) { onUnauthorized?.(); return }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Server error ${res.status}`)
      }
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  return (
    <div className="additional-screen">
      <BrandBar />
      <div className="results-header">
        <h1>Additional Info</h1>
      </div>

      <div className="results-body">
        {athlete && (
          <div className="athlete-banner">
            {athlete.first_name} {athlete.last_name}
          </div>
        )}

        {GROUPS.map(group => (
          <div key={group.label} className="form-section">
            <p className="form-section-label">{group.label}</p>
            <div className="form-grid">
              {group.fields.map(({ key, display }) => (
                <div key={key} className="form-field">
                  <label className="form-field-label">{display}</label>
                  <input
                    className="form-input"
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    value={values[key] ?? ''}
                    onChange={e => handleChange(key, e.target.value)}
                    disabled={saveState === 'saving' || saveState === 'saved'}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {saveState === 'error' && (
          <div className="error-card">Save failed — check connection and try again</div>
        )}
      </div>

      <div className="results-footer">
        {saveState === 'saved' ? (
          <>
            <div className="save-success">Additional info saved</div>
            <button className="retry-btn" onClick={onDone}>Done</button>
          </>
        ) : (
          <>
            <button
              className="retry-btn"
              onClick={handleSubmit}
              disabled={saveState === 'saving'}
            >
              {saveState === 'saving' ? 'Saving…' : 'Save'}
            </button>
            <button
              className="adjust-btn"
              onClick={onDone}
              disabled={saveState === 'saving'}
            >
              Skip
            </button>
            {onBack && (
              <button
                className="adjust-btn"
                onClick={onBack}
                disabled={saveState === 'saving'}
              >
                Back to Results
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
