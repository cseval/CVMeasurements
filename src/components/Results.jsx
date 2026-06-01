function cmToFtIn(cm) {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round((totalInches % 12) * 10) / 10;
  return `${feet}' ${inches}"`;
}

function cmToIn(cm) {
  return `${(cm / 2.54).toFixed(1)}"`;
}

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
    {
      key: 'height_cm',
      label: 'Height',
      cls: 'height',
      imperial: (v) => cmToFtIn(v),
    },
    {
      key: 'wingspan_cm',
      label: 'Wingspan',
      cls: 'wingspan',
      imperial: (v) => cmToFtIn(v),
    },
    {
      key: 'hand_width_cm',
      label: 'Hand Span',
      cls: 'hand',
      imperial: (v) => cmToIn(v),
    },
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

        {results?.debug_image && (
          <img
            src={`data:image/jpeg;base64,${results.debug_image}`}
            alt="Annotated measurement"
            style={{ width: '100%', borderRadius: 8, marginBottom: 12 }}
          />
        )}

        {measurements.map(({ key, label, cls, imperial }) => {
          const val = results?.[key];
          return (
            <div key={key} className={`measurement-card ${val != null ? cls : 'missing'}`}>
              <span className="label">{label}</span>
              <span className="value-group">
                <span className="value">{val != null ? `${val} cm` : '—'}</span>
                {val != null && (
                  <span className="value-imperial">{imperial(val)}</span>
                )}
              </span>
            </div>
          );
        })}

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
