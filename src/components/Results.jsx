export default function Results({ results, error, warnings, onRetry }) {
  if (error) {
    return (
      <div className="results-screen">
        <div className="results-header">
          <h1>Measurement Failed</h1>
        </div>
        <div className="results-body">
          <div className="error-card">{error}</div>
        </div>
        <div className="results-footer">
          <button className="retry-btn" onClick={onRetry}>Try Again</button>
        </div>
      </div>
    );
  }

  const measurements = [
    { key: 'height_cm',     label: 'Height',     unit: 'cm', cls: 'height'   },
    { key: 'wingspan_cm',   label: 'Wingspan',   unit: 'cm', cls: 'wingspan' },
    { key: 'hand_width_cm', label: 'Hand Width', unit: 'cm', cls: 'hand'     },
  ];

  return (
    <div className="results-screen">
      <div className="results-header">
        <h1>Measurements</h1>
      </div>

      <div className="results-body">
        {warnings?.map((w, i) => (
          <div key={i} className="error-card" style={{ fontSize: 13 }}>{w}</div>
        ))}

        {measurements.map(({ key, label, unit, cls }) => (
          <div key={key} className={`measurement-card ${results?.[key] != null ? cls : 'missing'}`}>
            <span className="label">{label}</span>
            <span className="value">
              {results?.[key] != null ? `${results[key]} ${unit}` : '—'}
            </span>
          </div>
        ))}

        {results?.px_per_cm && (
          <p className="scale-note">Scale: {results.px_per_cm} px / cm</p>
        )}
      </div>

      <div className="results-footer">
        <button className="retry-btn" onClick={onRetry}>Measure Again</button>
      </div>
    </div>
  );
}
