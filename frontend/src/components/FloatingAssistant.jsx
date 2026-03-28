import { useState } from "react";

function FloatingAssistant({ context, signal, intervention }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isClosed, setIsClosed] = useState(false);

  const issueText = signal?.issueType
    ? `${signal.issueType} (${signal.issueSeverity || "low"})`
    : "No active issue";

  if (isClosed) {
    return (
      <button className="assistant-reopen" onClick={() => setIsClosed(false)}>
        Open DecisionOS
      </button>
    );
  }

  if (isCollapsed) {
    return (
      <aside className="floating-assistant collapsed" aria-live="polite">
        <div className="assistant-head">
          <div className="assistant-title">DecisionOS Live</div>
          <div className="assistant-controls">
            <button type="button" onClick={() => setIsCollapsed(false)} aria-label="Expand assistant">
              +
            </button>
            <button type="button" onClick={() => setIsClosed(true)} aria-label="Close assistant">
              x
            </button>
          </div>
        </div>
        <p className="assistant-summary">
          <strong>Signal:</strong> {issueText}
        </p>
      </aside>
    );
  }

  return (
    <aside className="floating-assistant" aria-live="polite">
      <div className="assistant-head">
        <div className="assistant-title">DecisionOS Live</div>
        <div className="assistant-controls">
          <button type="button" onClick={() => setIsCollapsed(true)} aria-label="Collapse assistant">
            -
          </button>
          <button type="button" onClick={() => setIsClosed(true)} aria-label="Close assistant">
            x
          </button>
        </div>
      </div>
      <p className="assistant-summary">
        {context?.activityType || "reading"} on {context?.domain || "unknown"} • {context?.category || "consuming_content"}
      </p>
      <p className="assistant-summary">
        <strong>Current signal:</strong> {issueText}
      </p>
      {intervention ? (
        <ul className="assistant-list">
          <li>
            <strong>Cause:</strong> {intervention.reason}
          </li>
          <li>
            <strong>Action:</strong> {intervention.nextAction}
          </li>
        </ul>
      ) : null}
    </aside>
  );
}

export default FloatingAssistant;
