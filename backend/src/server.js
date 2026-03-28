import dotenv from "dotenv";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { SessionStore } from "./sessionStore.js";
import { detectIssue } from "./detectionEngine.js";
import { generateIntervention } from "./aiService.js";
import { getLearningAssets, getProblemById, problems } from "./knowledgeGraph.js";

dotenv.config({ path: new URL("../../.env", import.meta.url) });
dotenv.config();

const app = express();
const server = http.createServer(app);

const port = Number(process.env.PORT || 8787);
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const io = new Server(server, {
  cors: {
    origin: clientOrigin,
    methods: ["GET", "POST"]
  }
});

const store = new SessionStore();

app.use(cors({ origin: clientOrigin }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "Nudge backend" });
});

app.get("/api/problems", (_req, res) => {
  res.json({ problems });
});

app.post("/api/session/start", (req, res) => {
  const learnerName = req.body?.learnerName || "Demo Student";
  const session = store.createSession(learnerName);
  res.json({ sessionId: session.id, startedAt: session.startedAt });
});

app.post("/api/session/:sessionId/end", (req, res) => {
  store.endSession(req.params.sessionId);
  res.json({ ok: true });
});

app.post("/api/session/attempt", (req, res) => {
  const { sessionId, problemId, answer = "" } = req.body || {};
  const session = store.getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const problem = getProblemById(problemId);
  if (!problem) {
    return res.status(404).json({ error: "Problem not found" });
  }

  const evaluation = evaluateAnswer(problemId, answer);

  store.addAttempt(sessionId, {
    problemId,
    answer,
    isCorrect: evaluation.isCorrect,
    inefficient: evaluation.inefficient,
    feedback: evaluation.feedback
  });

  if (!evaluation.isCorrect) {
    store.trackIssue(sessionId, {
      type: "confusion",
      concept: problem.concepts[0]
    });
  }

  return res.json({
    ...evaluation,
    concept: problem.concepts[0],
    mastery: store.getSession(sessionId)?.masteryByConcept
  });
});

app.get("/api/session/:sessionId/summary", (req, res) => {
  const summary = store.getSummary(req.params.sessionId);
  if (!summary) {
    return res.status(404).json({ error: "Session not found" });
  }

  return res.json(summary);
});

io.on("connection", (socket) => {
  socket.on("session:join", ({ sessionId }) => {
    if (!sessionId || !store.getSession(sessionId)) {
      socket.emit("session:error", { message: "Invalid session" });
      return;
    }

    socket.join(sessionId);
    socket.emit("session:joined", { sessionId });
  });

  socket.on("session:metrics", async ({ sessionId, metrics }) => {
    const session = store.addMetrics(sessionId, metrics || {});
    if (!session) {
      return;
    }

    const issue = detectIssue(session, metrics || {});

    io.to(sessionId).emit("session:signal", {
      ts: Date.now(),
      confusionScore: issue?.diagnostics?.confusionScore || 0,
      issueType: issue?.type || null,
      issueSeverity: issue?.severity || null
    });

    if (!issue) {
      return;
    }

    store.trackIssue(sessionId, issue);

    if (!store.canEmitIntervention(sessionId, issue.type)) {
      return;
    }

    const problem = getProblemById(metrics?.problemId || session.currentProblemId);
    const focusPrereq = issue.diagnostics?.missingPrerequisite;
    const assets = getLearningAssets(issue.concept, focusPrereq);

    const aiIntervention = await generateIntervention({
      issue,
      problem,
      metrics,
      sessionSnapshot: session,
      assets
    });

    const intervention = {
      type: issue.type,
      severity: issue.severity,
      concept: issue.concept,
      reason: issue.reason,
      diagnostics: issue.diagnostics,
      ...aiIntervention
    };

    store.addIntervention(sessionId, intervention);
    const latest = store.getSession(sessionId)?.interventions.slice(-1)[0];

    io.to(sessionId).emit("intervention", latest);
  });

  socket.on("session:intervention-result", ({ sessionId, interventionId }) => {
    store.markInterventionApplied(sessionId, interventionId);
  });
});

server.listen(port, () => {
  console.log(`Nudge backend running at http://localhost:${port}`);
});

function evaluateAnswer(problemId, rawAnswer) {
  const answer = rawAnswer || "";
  const normalized = answer.toLowerCase();

  if (problemId === "loop-even-sum") {
    const hasLoop = /for\s*\(|while\s*\(|for\s*\w+\s+of/.test(normalized);
    const filtersEven = /%\s*2\s*===?\s*0/.test(normalized);
    const accumulates = /sum\s*\+\=|total\s*\+\=/.test(normalized);
    const isCorrect = hasLoop && filtersEven && accumulates;
    const inefficient = /for[\s\S]{0,120}for/.test(normalized);

    return {
      isCorrect,
      inefficient,
      feedback: isCorrect
        ? "Great job. You used iteration plus an even check correctly."
        : "You likely need a loop, an even-number condition, and an accumulator variable."
    };
  }

  if (problemId === "recursive-factorial") {
    const hasBaseCase = /if\s*\(\s*n\s*<=?\s*1\s*\)/.test(normalized) || /n\s*===\s*0/.test(normalized);
    const hasRecursiveCall = /factorial\s*\(\s*n\s*-\s*1\s*\)/.test(normalized);
    const multiplies = /n\s*\*\s*factorial/.test(normalized);
    const isCorrect = hasBaseCase && hasRecursiveCall && multiplies;
    const inefficient = /for\s*\(|while\s*\(/.test(normalized) && hasRecursiveCall;

    return {
      isCorrect,
      inefficient,
      feedback: isCorrect
        ? "Nice recursion structure: base case plus recursive reduction."
        : "Factorial recursion needs a base case and a call to factorial(n - 1)."
    };
  }

  return {
    isCorrect: false,
    inefficient: false,
    feedback: "No evaluator configured for this problem yet."
  };
}
