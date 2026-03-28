function FloatingAssistant({ intervention }) {
  return (
    <aside className="floating-assistant" aria-live="polite">
      <div className="assistant-title">Nudge Live Reasoner</div>
      {intervention ? (
        <>
          <p className="assistant-summary">{intervention.reason}</p>
          <ul className="assistant-list">
            <li>
              <strong>Mini lesson:</strong> {intervention.miniLesson}
            </li>
            <li>
              <strong>Example:</strong> <code>{intervention.shortExample}</code>
            </li>
            <li>
              <strong>Practice:</strong> {intervention.quickPractice}
            </li>
          </ul>
        </>
      ) : (
        <p className="assistant-summary">
          Monitoring decision signals. Interventions trigger when confusion, gaps, or inefficient patterns appear.
        </p>
      )}
    </aside>
  );
}

export default FloatingAssistant;
