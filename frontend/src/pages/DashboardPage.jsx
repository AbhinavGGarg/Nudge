import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { fetchSummary } from "../lib/api";

const ISSUE_COLORS = ["#f97316", "#0ea5e9", "#f43f5e"];

function DashboardPage() {
  const { sessionId } = useParams();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      if (!sessionId) {
        return;
      }

      setLoading(true);
      setError("");

      try {
        const data = await fetchSummary(sessionId);
        if (!cancelled) {
          setSummary(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load summary");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSummary();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const issueData = useMemo(() => {
    if (!summary) {
      return [];
    }

    return Object.entries(summary.issueCounters || {}).map(([name, value]) => ({ name, value }));
  }, [summary]);

  if (loading) {
    return <main className="page-shell">Loading session analytics...</main>;
  }

  if (error) {
    return (
      <main className="page-shell">
        <p>{error}</p>
        <Link to="/" className="btn btn-primary">
          Back to Workspace
        </Link>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <h1>Nudge Dashboard</h1>
          <p>Session intelligence report for {summary.learnerName}</p>
        </div>
        <Link to="/" className="btn btn-primary">
          Start New Session
        </Link>
      </header>

      <section className="dashboard-cards">
        <Card title="Session Duration" value={formatDuration(summary.durationMs)} />
        <Card title="Time Wasted" value={formatDuration(summary.timeWastedMs)} />
        <Card title="Interventions" value={summary.interventions.length} />
        <Card title="Intervention Effectiveness" value={`${Math.round(summary.interventionEffectiveness * 100)}%`} />
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <h3>Mastery by Concept</h3>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.masteryByConcept}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.22)" />
                <XAxis dataKey="concept" tick={{ fill: "#1f2937", fontSize: 12 }} />
                <YAxis tick={{ fill: "#1f2937", fontSize: 12 }} domain={[0, 1]} />
                <Tooltip />
                <Bar dataKey="mastery" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel">
          <h3>Issue Distribution</h3>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={issueData} dataKey="value" nameKey="name" outerRadius={92} innerRadius={46}>
                  {issueData.map((entry, index) => (
                    <Cell key={entry.name} fill={ISSUE_COLORS[index % ISSUE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel">
          <h3>Top Struggled Concepts</h3>
          <div className="list-wrap">
            {summary.struggledConcepts.length === 0 ? <p>No major struggles detected.</p> : null}
            {summary.struggledConcepts.map((item) => (
              <div className="list-item" key={item.concept}>
                <strong>{item.concept}</strong>
                <span>Struggle score: {item.struggleScore.toFixed(1)}</span>
                <span>Incorrect attempts: {item.incorrectAttempts}</span>
                <span>Mastery: {Math.round(item.mastery * 100)}%</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <h3>Prerequisite Gaps</h3>
          <div className="list-wrap">
            {summary.prerequisiteGaps.length === 0 ? <p>No prerequisite gaps identified.</p> : null}
            {summary.prerequisiteGaps.map((gap) => (
              <div className="list-item" key={`${gap.concept}-${gap.missingPrerequisite}`}>
                <strong>
                  {gap.concept} depends on {gap.missingPrerequisite}
                </strong>
                <span>Prerequisite mastery: {Math.round(gap.mastery * 100)}%</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel">
        <h3>Improvement Suggestions</h3>
        <div className="list-wrap">
          {summary.improvementSuggestions.map((suggestion, index) => (
            <div className="list-item" key={index}>
              <strong>Action {index + 1}</strong>
              <span>{suggestion}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Card({ title, value }) {
  return (
    <article className="panel stat-card">
      <p>{title}</p>
      <strong>{value}</strong>
    </article>
  );
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor((durationMs || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export default DashboardPage;
