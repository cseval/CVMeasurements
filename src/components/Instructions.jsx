const STEPS = [
  {
    title: 'Print the marker',
    body: 'Print a 12x12, 16x16, or 20x20 marker',
  },
  {
    title: 'T-pose',
    body: 'Athlete stands with their back close to the wall, arms fully extended horizontally at shoulder height.',
  },
  {
    title: 'Palms forward',
    body: 'Palms face the camera, fingers together and straight.',
  },
  {
    title: 'Frame the shot',
    body: 'Hold the camera at chest height. The full body — head to feet — must be in frame, with the marker fully visible.',
  },
  {
    title: 'Lighting',
    body: 'Use even light. Avoid strong shadows on the hands or feet — shadows reduce detection accuracy.',
  },
];

export default function Instructions({ onStart }) {
  return (
    <div className="instructions-screen">
      <div className="instructions-header">
        <h1>Setup</h1>
        <p className="instructions-sub">Follow these steps before capturing</p>
      </div>

      <div className="instructions-body">
        {STEPS.map((step, i) => (
          <div key={i} className="step-row">
            <div className="step-num">{i + 1}</div>
            <div className="step-text">
              <span className="step-title">{step.title}</span>
              <span className="step-body">{step.body}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="instructions-footer">
        <button className="retry-btn" onClick={onStart}>Start</button>
      </div>
    </div>
  );
}
