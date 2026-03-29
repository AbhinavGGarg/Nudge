import { Link, Navigate, useSearchParams } from "react-router-dom";

function LiveResultsPage() {
  const [searchParams] = useSearchParams();

  let sessionId = "";
  try {
    sessionId = (searchParams.get("sessionId") || "").trim();
  } catch {
    sessionId = "";
  }

  if (!sessionId && typeof window !== "undefined") {
    try {
      sessionId = (window.localStorage.getItem("tether_last_session_id") || "").trim();
    } catch {
      sessionId = "";
    }
  }

  if (sessionId) {
    return <Navigate to={`/dashboard/${sessionId}`} replace />;
  }

  return (
    <main className="page-shell">
      <section className="panel">
        <h2>No live results session found yet</h2>
        <p>Start a Tether session first, then open live results again.</p>
        <Link to="/" className="btn btn-primary">
          Open Tether Workspace
        </Link>
      </section>
    </main>
  );
}

export default LiveResultsPage;
