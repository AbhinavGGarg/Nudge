import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import InterventionPopup from "../components/InterventionPopup";
import {
  endSession,
  markInterventionApplied,
  recordMetrics,
  startSession
} from "../lib/api";

const DEFAULT_MASTERY = {
  variables: 0.7,
  functions: 0.66,
  loops: 0.58,
  conditionals: 0.62,
  arrays: 0.68,
  recursion: 0.4
};

function WorkspacePage() {
  const navigate = useNavigate();

  const [learnerName, setLearnerName] = useState("");
  const [learnerDraft, setLearnerDraft] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [connected, setConnected] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [startError, setStartError] = useState("");
  const [signal, setSignal] = useState({ issueType: null, issueSeverity: null, confusionScore: 0 });
  const [telemetry, setTelemetry] = useState({
    typingSpeed: 0,
    pauseDurationMs: 0,
    repeatedEdits: 0,
    deletionRate: 0,
    complexityScore: 0,
    timeOnProblemMs: 0,
    totalKeystrokes: 0
  });
  const [activeIntervention, setActiveIntervention] = useState(null);
  const [interventionHistory, setInterventionHistory] = useState([]);
  const [masteryMap, setMasteryMap] = useState(DEFAULT_MASTERY);
  const dismissedIssueUntilRef = useRef({});

  const sessionStartRef = useRef(Date.now());
  const lastInputRef = useRef(Date.now());
  const keyEventsRef = useRef([]);
  const editEventsRef = useRef([]);
  const keystrokesSinceSendRef = useRef(0);
  const totalKeystrokesRef = useRef(0);

  async function handleCreateSession() {
    const cleanName = learnerDraft.trim();
    if (!cleanName) {
      setStartError("Enter a learner name to begin.");
      return;
    }

    setStartingSession(true);
    setStartError("");

    try {
      const sessionResponse = await startSession(cleanName);
      setSessionId(sessionResponse.sessionId);
      setLearnerName(cleanName);
      sessionStartRef.current = Date.now();
      lastInputRef.current = Date.now();
      keyEventsRef.current = [];
      editEventsRef.current = [];
      keystrokesSinceSendRef.current = 0;
      totalKeystrokesRef.current = 0;
      dismissedIssueUntilRef.current = {};
      setConnected(true);
    } catch (error) {
      setStartError("Could not start session. Try again.");
    } finally {
      setStartingSession(false);
    }
  }

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const timer = setInterval(() => {
      const now = Date.now();
      const tenSecondsAgo = now - 10000;
      const twentySecondsAgo = now - 20000;

      keyEventsRef.current = keyEventsRef.current.filter((ts) => ts >= tenSecondsAgo);
      editEventsRef.current = editEventsRef.current.filter((event) => event.ts >= twentySecondsAgo);

      const pauseDurationMs = now - lastInputRef.current;
      const repeatedEdits = editEventsRef.current.filter((event) => event.type === "delete").length;
      const insertCount = editEventsRef.current.filter((event) => event.type === "insert").length;
      const deleteCount = repeatedEdits;
      const typingSpeed = Number((keyEventsRef.current.length / 10).toFixed(2));
      const deletionRate = Number((deleteCount / Math.max(1, insertCount + deleteCount)).toFixed(2));
      const complexityScore = 0;
      const nestedLoopSignals = 0;
      const timeOnProblemMs = now - sessionStartRef.current;

      const metrics = {
        problemId: "live-monitor",
        typingSpeed,
        pauseDurationMs,
        repeatedEdits,
        deletionRate,
        complexityScore,
        nestedLoopSignals,
        timeOnProblemMs,
        keystrokesDelta: keystrokesSinceSendRef.current
      };

      const realtime = recordMetrics(sessionId, metrics);
      if (realtime?.signal) {
        setSignal(realtime.signal);
      }
      if (realtime?.intervention) {
        const snoozeUntil = dismissedIssueUntilRef.current[realtime.intervention.type] || 0;
        if (Date.now() >= snoozeUntil) {
          setActiveIntervention(realtime.intervention);
          setInterventionHistory((prev) => {
            if (prev.some((item) => item.id === realtime.intervention.id)) {
              return prev;
            }
            return [realtime.intervention, ...prev].slice(0, 6);
          });
        }
      }

      setTelemetry({
        typingSpeed,
        pauseDurationMs,
        repeatedEdits,
        deletionRate,
        complexityScore,
        timeOnProblemMs,
        totalKeystrokes: totalKeystrokesRef.current
      });

      keystrokesSinceSendRef.current = 0;
    }, 2000);

    return () => clearInterval(timer);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    function onKeyDown(event) {
      const trackable = event.key.length === 1 || ["Backspace", "Delete", "Enter", "Tab"].includes(event.key);
      if (!trackable) {
        return;
      }

      const now = Date.now();
      keyEventsRef.current.push(now);
      lastInputRef.current = now;
      keystrokesSinceSendRef.current += 1;
      totalKeystrokesRef.current += 1;

      if (event.key === "Backspace" || event.key === "Delete") {
        editEventsRef.current.push({ ts: now, type: "delete" });
      } else {
        editEventsRef.current.push({ ts: now, type: "insert" });
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [sessionId]);

  function applyIntervention(intervention) {
    if (!intervention) {
      return;
    }

    markInterventionApplied(sessionId, intervention.id);
    setMasteryMap((prev) => ({
      ...prev,
      [intervention.concept]: Math.min(0.99, (prev[intervention.concept] || 0.5) + 0.04)
    }));
    dismissedIssueUntilRef.current[intervention.type] = Date.now() + 4 * 60 * 1000;
    setActiveIntervention(null);
  }

  function dismissIntervention(interventionId) {
    const target = interventionHistory.find((item) => item.id === interventionId) || activeIntervention;
    if (target?.type) {
      dismissedIssueUntilRef.current[target.type] = Date.now() + 4 * 60 * 1000;
    }
    setActiveIntervention(null);
  }

  async function goToDashboard() {
    if (!sessionId) {
      return;
    }

    await endSession(sessionId);
    navigate(`/dashboard/${sessionId}`);
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <h1>Nudge</h1>
          <p>Real-time intervention system for coding cognition</p>
        </div>
        <div className="status-cluster">
          <span className={`status-pill ${connected ? "online" : "offline"}`}>
            {connected ? "Live Monitoring" : "Session not started"}
          </span>
          {learnerName ? <span className="status-pill online">Learner: {learnerName}</span> : null}
          {sessionId ? (
            <button className="btn btn-primary" onClick={goToDashboard}>
              End Session + Dashboard
            </button>
          ) : null}
        </div>
      </header>

      {!sessionId ? (
        <section className="panel">
          <h3>Create Learner Session</h3>
          <p>Enter learner name to start monitoring. No default learner is pre-filled.</p>
          <div className="action-row">
            <input
              value={learnerDraft}
              onChange={(event) => setLearnerDraft(event.target.value)}
              placeholder="Learner name"
              className="session-input"
            />
            <button className="btn btn-primary" onClick={handleCreateSession} disabled={startingSession}>
              {startingSession ? "Starting..." : "Start Session"}
            </button>
          </div>
          {startError ? <p className="start-error">{startError}</p> : null}
        </section>
      ) : null}

      {sessionId ? (
        <section className="workspace-grid workspace-grid-single">
          <aside className="panel panel-side">
            <h3>Live Detection Feed</h3>
            <p className="monitor-note">
              The web app tracks engagement signals only. Use the Chrome extension for page-level live monitoring.
            </p>
            <div className="metric-grid">
              <Metric label="Typing speed" value={`${telemetry.typingSpeed} keys/s`} />
              <Metric label="Pause" value={`${Math.round(telemetry.pauseDurationMs / 1000)}s`} />
              <Metric label="Repeated edits" value={telemetry.repeatedEdits} />
              <Metric label="Deletion rate" value={telemetry.deletionRate} />
              <Metric label="Complexity score" value={telemetry.complexityScore} />
              <Metric label="Total keystrokes" value={telemetry.totalKeystrokes} />
            </div>

            <div className="signal-box">
              <h4>Current issue signal</h4>
              <p>
                {signal.issueType ? `${signal.issueType} (${signal.issueSeverity})` : "No active issue"}
              </p>
              <div className="progress-track">
                <span style={{ width: `${Math.min(100, Math.round(signal.confusionScore * 100))}%` }} />
              </div>
            </div>

            <div className="mastery-box">
              <h4>Concept mastery</h4>
              {Object.entries(masteryMap).map(([concept, mastery]) => (
                <div className="mastery-row" key={concept}>
                  <span>{concept}</span>
                  <div className="progress-track">
                    <span style={{ width: `${Math.round(mastery * 100)}%` }} />
                  </div>
                  <strong>{Math.round(mastery * 100)}%</strong>
                </div>
              ))}
            </div>

            <div className="timeline-box">
              <h4>Intervention timeline</h4>
              {interventionHistory.length === 0 ? <p>No interventions yet.</p> : null}
              {interventionHistory.map((item) => (
                <div key={item.id} className="timeline-item">
                  <span>{item.type}</span>
                  <p>{item.message}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>
      ) : null}

      {sessionId ? (
        <InterventionPopup
          intervention={activeIntervention}
          onApply={applyIntervention}
          onDismiss={dismissIntervention}
        />
      ) : null}
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default WorkspacePage;
