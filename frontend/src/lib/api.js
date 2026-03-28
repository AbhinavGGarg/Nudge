const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Request failed: ${response.status}`);
  }

  return response.json();
}

function getApiBase() {
  return API_BASE;
}

function getSocketBase() {
  return import.meta.env.VITE_SOCKET_URL || API_BASE;
}

function fetchProblems() {
  return api("/api/problems");
}

function startSession(learnerName) {
  return api("/api/session/start", {
    method: "POST",
    body: JSON.stringify({ learnerName })
  });
}

function submitAttempt(payload) {
  return api("/api/session/attempt", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function endSession(sessionId) {
  return api(`/api/session/${sessionId}/end`, {
    method: "POST"
  });
}

function fetchSummary(sessionId) {
  return api(`/api/session/${sessionId}/summary`);
}

export { endSession, fetchProblems, fetchSummary, getApiBase, getSocketBase, startSession, submitAttempt };
