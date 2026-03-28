const API_BASE = import.meta.env.VITE_API_BASE || "";
const REMOTE_MODE = Boolean(API_BASE);

const LOCAL_SESSION_PREFIX = "nudge:session:";
const LOCAL_DEFAULT_MASTERY = {
  variables: 0.7,
  functions: 0.66,
  loops: 0.58,
  conditionals: 0.62,
  arrays: 0.68,
  recursion: 0.4
};

const conceptGraph = {
  variables: {
    requires: [],
    refresher: "Variables store values that your code updates as it runs.",
    example: "let total = 0; total += 2;"
  },
  functions: {
    requires: ["variables"],
    refresher: "Functions package repeatable logic into clean reusable blocks.",
    example: "function add(a, b) { return a + b; }"
  },
  loops: {
    requires: ["variables"],
    refresher: "Loops repeat logic over values or until a condition changes.",
    example: "for (const n of nums) { total += n; }"
  },
  conditionals: {
    requires: ["variables"],
    refresher: "Conditionals branch behavior based on a true/false check.",
    example: "if (n % 2 === 0) { total += n; }"
  },
  arrays: {
    requires: ["variables"],
    refresher: "Arrays store ordered values and pair naturally with loops.",
    example: "const nums = [2, 4, 6];"
  },
  recursion: {
    requires: ["functions", "conditionals"],
    refresher: "Recursion solves a problem by reducing it into smaller self-calls.",
    example: "if (n <= 1) return 1; return n * factorial(n - 1);"
  }
};

const localProblems = [
  {
    id: "loop-even-sum",
    title: "Sum Even Numbers",
    difficulty: "Foundational",
    concepts: ["loops", "conditionals", "arrays", "variables"],
    prompt: "Write a JavaScript function `sumEven(nums)` that returns the sum of only even numbers in an array.",
    starterCode: "function sumEven(nums) {\n  // TODO\n}"
  },
  {
    id: "recursive-factorial",
    title: "Recursive Factorial",
    difficulty: "Intermediate",
    concepts: ["recursion", "functions", "conditionals"],
    prompt: "Write a JavaScript function `factorial(n)` using recursion. Return 1 for the base case.",
    starterCode: "function factorial(n) {\n  // TODO\n}"
  }
];

function isRemoteMode() {
  return REMOTE_MODE;
}

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

async function fetchProblems() {
  if (REMOTE_MODE) {
    try {
      return await api("/api/problems");
    } catch {
      return { problems: localProblems };
    }
  }
  return { problems: localProblems };
}

async function startSession(learnerName) {
  if (REMOTE_MODE) {
    try {
      const remote = await api("/api/session/start", {
        method: "POST",
        body: JSON.stringify({ learnerName })
      });
      ensureLocalSession(remote.sessionId, learnerName, remote.startedAt);
      return remote;
    } catch {
      return startLocalSession(learnerName);
    }
  }
  return startLocalSession(learnerName);
}

async function submitAttempt(payload) {
  if (REMOTE_MODE) {
    try {
      const remote = await api("/api/session/attempt", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      // Keep local session mirror updated even in remote mode.
      localSubmitAttempt(payload.sessionId, payload.problemId, payload.answer);
      return remote;
    } catch {
      return localSubmitAttempt(payload.sessionId, payload.problemId, payload.answer);
    }
  }
  return localSubmitAttempt(payload.sessionId, payload.problemId, payload.answer);
}

async function endSession(sessionId) {
  if (REMOTE_MODE) {
    try {
      await api(`/api/session/${sessionId}/end`, {
        method: "POST"
      });
    } catch {
      // Fall through to local end.
    }
  }
  localEndSession(sessionId);
  return { ok: true };
}

async function fetchSummary(sessionId) {
  if (REMOTE_MODE) {
    try {
      return await api(`/api/session/${sessionId}/summary`);
    } catch {
      return localFetchSummary(sessionId);
    }
  }
  return localFetchSummary(sessionId);
}

function recordMetrics(sessionId, metrics) {
  const session = readSession(sessionId);
  if (!session) {
    return { signal: { issueType: null, issueSeverity: null, confusionScore: 0 }, intervention: null };
  }

  session.metricsHistory.push({ ts: Date.now(), ...metrics });
  session.aggregate.totalKeystrokes += metrics.keystrokesDelta || 0;
  session.aggregate.totalPauseMs += metrics.pauseDurationMs || 0;
  session.aggregate.timeOnTaskMs = Math.max(session.aggregate.timeOnTaskMs, metrics.timeOnProblemMs || 0);

  if ((metrics.pauseDurationMs || 0) > 10000) {
    session.aggregate.unproductiveTimeMs += metrics.pauseDurationMs;
  }
  if ((metrics.repeatedEdits || 0) >= 6) {
    session.aggregate.repeatedEditBursts += 1;
    session.aggregate.unproductiveTimeMs += 4000;
  }

  const issue = detectIssue(session, metrics);
  const signal = {
    issueType: issue?.type || null,
    issueSeverity: issue?.severity || null,
    confusionScore: Number((issue?.diagnostics?.confusionScore || 0).toFixed(2))
  };

  let intervention = null;
  if (issue) {
    bumpIssueCounters(session, issue);
    if (canEmitIntervention(session, issue.type)) {
      intervention = buildIntervention(issue);
      session.interventions.push(intervention);
    }
  }

  writeSession(session);
  return { signal, intervention };
}

function markInterventionApplied(sessionId, interventionId) {
  const session = readSession(sessionId);
  if (!session) {
    return;
  }
  const target = session.interventions.find((entry) => entry.id === interventionId);
  if (target) {
    target.applied = true;
    const concept = target.concept;
    session.masteryByConcept[concept] = Math.min(0.99, (session.masteryByConcept[concept] || 0.5) + 0.04);
  }
  writeSession(session);
}

function startLocalSession(learnerName = "Demo Student") {
  const sessionId = createSessionId();
  const startedAt = Date.now();
  const session = createSessionObject(sessionId, learnerName, startedAt);
  writeSession(session);
  return { sessionId, startedAt };
}

function ensureLocalSession(sessionId, learnerName = "Demo Student", startedAt = Date.now()) {
  const existing = readSession(sessionId);
  if (existing) {
    return existing;
  }
  const session = createSessionObject(sessionId, learnerName, startedAt);
  writeSession(session);
  return session;
}

function createSessionObject(sessionId, learnerName, startedAt) {
  return {
    id: sessionId,
    learnerName,
    startedAt,
    endedAt: null,
    metricsHistory: [],
    attempts: [],
    interventions: [],
    masteryByConcept: { ...LOCAL_DEFAULT_MASTERY },
    conceptStats: {},
    issueCounters: {
      confusion: 0,
      knowledge_gap: 0,
      inefficiency: 0
    },
    aggregate: {
      totalKeystrokes: 0,
      totalPauseMs: 0,
      repeatedEditBursts: 0,
      timeOnTaskMs: 0,
      unproductiveTimeMs: 0
    },
    lastInterventionByType: {}
  };
}

function localSubmitAttempt(sessionId, problemId, answer = "") {
  const session = ensureLocalSession(sessionId);
  const problem = localProblems.find((entry) => entry.id === problemId);
  const evaluation = evaluateAnswer(problemId, answer);

  session.attempts.push({
    ts: Date.now(),
    problemId,
    answer,
    isCorrect: evaluation.isCorrect,
    inefficient: evaluation.inefficient
  });

  const concept = problem?.concepts?.[0] || "functions";
  const stats = ensureConceptStats(session, concept);

  if (evaluation.isCorrect) {
    stats.correct += 1;
    session.masteryByConcept[concept] = Math.min(0.98, (session.masteryByConcept[concept] || 0.5) + 0.08);
  } else {
    stats.incorrect += 1;
    stats.confusionSignals += 1;
    session.masteryByConcept[concept] = Math.max(0.2, (session.masteryByConcept[concept] || 0.5) - 0.06);
    session.issueCounters.confusion += 1;
  }

  if (evaluation.inefficient) {
    stats.inefficiencyFlags += 1;
    session.issueCounters.inefficiency += 1;
  }

  writeSession(session);

  return {
    ...evaluation,
    concept,
    mastery: session.masteryByConcept
  };
}

function localEndSession(sessionId) {
  const session = readSession(sessionId);
  if (!session) {
    return;
  }
  session.endedAt = Date.now();
  writeSession(session);
}

function localFetchSummary(sessionId) {
  const session = readSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const endedAt = session.endedAt || Date.now();
  const durationMs = endedAt - session.startedAt;
  const timeWastedMs = Math.min(durationMs, session.aggregate.unproductiveTimeMs + session.aggregate.repeatedEditBursts * 2500);

  const struggledConcepts = Object.entries(session.conceptStats)
    .map(([concept, stats]) => ({
      concept,
      struggleScore: stats.incorrect * 2 + stats.confusionSignals * 1.4 + stats.inefficiencyFlags,
      incorrectAttempts: stats.incorrect,
      confusionSignals: stats.confusionSignals,
      inefficiencyFlags: stats.inefficiencyFlags,
      mastery: Number((session.masteryByConcept[concept] || 0.5).toFixed(2))
    }))
    .sort((a, b) => b.struggleScore - a.struggleScore)
    .slice(0, 6);

  const topConcept = struggledConcepts[0]?.concept || "loops";
  const prerequisiteGaps = getPrerequisiteGaps(topConcept, session.masteryByConcept)
    .concat(getPrerequisiteGaps("recursion", session.masteryByConcept))
    .filter((item, idx, list) => {
      const key = `${item.concept}-${item.missingPrerequisite}`;
      return list.findIndex((entry) => `${entry.concept}-${entry.missingPrerequisite}` === key) === idx;
    })
    .slice(0, 6);

  const resolvedInterventions = session.interventions.filter((entry) => entry.applied).length;
  const interventionEffectiveness = session.interventions.length
    ? Number((resolvedInterventions / session.interventions.length).toFixed(2))
    : 0;

  return {
    sessionId: session.id,
    learnerName: session.learnerName,
    startedAt: session.startedAt,
    endedAt,
    durationMs,
    timeWastedMs,
    issueCounters: session.issueCounters,
    struggledConcepts,
    prerequisiteGaps,
    masteryByConcept: Object.entries(session.masteryByConcept).map(([concept, mastery]) => ({
      concept,
      mastery: Number(mastery.toFixed(2))
    })),
    interventions: session.interventions,
    interventionEffectiveness,
    improvementSuggestions: buildImprovementSuggestions(struggledConcepts, prerequisiteGaps)
  };
}

function detectIssue(session, metrics) {
  const {
    problemId,
    typingSpeed = 0,
    pauseDurationMs = 0,
    repeatedEdits = 0,
    deletionRate = 0,
    complexityScore = 0,
    nestedLoopSignals = 0
  } = metrics;

  const problem = localProblems.find((entry) => entry.id === problemId);
  const concept = problem?.concepts?.[0] || "functions";
  const recentAttempts = session.attempts.filter((attempt) => attempt.problemId === problemId).slice(-3);
  const incorrectAttempts = recentAttempts.filter((attempt) => !attempt.isCorrect).length;

  const confusionSignals = [];
  if (pauseDurationMs > 11000) {
    confusionSignals.push("long_pause");
  }
  if (repeatedEdits >= 6 || deletionRate > 0.32) {
    confusionSignals.push("churn_editing");
  }
  if (typingSpeed < 1.1 && (metrics.timeOnProblemMs || 0) > 60000) {
    confusionSignals.push("slow_progress");
  }
  if (incorrectAttempts >= 2) {
    confusionSignals.push("repeat_incorrect_attempts");
  }

  const confusionScore =
    (pauseDurationMs > 0 ? Math.min(1, pauseDurationMs / 18000) : 0) * 0.4 +
    Math.min(1, repeatedEdits / 10) * 0.25 +
    Math.min(1, incorrectAttempts / 3) * 0.2 +
    Math.min(1, Math.max(0, 1.3 - typingSpeed)) * 0.15;

  const prerequisiteGaps = getPrerequisiteGaps(concept, session.masteryByConcept);
  if (prerequisiteGaps.length > 0 && (incorrectAttempts >= 1 || confusionSignals.length >= 2)) {
    return {
      type: "knowledge_gap",
      severity: confusionScore > 0.72 ? "high" : "medium",
      concept,
      reason: `Current task relies on ${prerequisiteGaps[0].missingPrerequisite}, but mastery is low.`,
      diagnostics: {
        confusionSignals,
        incorrectAttempts,
        confusionScore,
        missingPrerequisite: prerequisiteGaps[0].missingPrerequisite
      }
    };
  }

  if (confusionSignals.length >= 2 || confusionScore > 0.64) {
    return {
      type: "confusion",
      severity: confusionScore > 0.82 ? "high" : "medium",
      concept,
      reason: "Behavior indicates the learner is stuck or uncertain.",
      diagnostics: { confusionSignals, incorrectAttempts, confusionScore }
    };
  }

  const inefficiencyDetected = complexityScore > 0.72 || nestedLoopSignals > 0;
  if (inefficiencyDetected) {
    return {
      type: "inefficiency",
      severity: complexityScore > 0.82 ? "medium" : "low",
      concept,
      reason: "Solution path appears over-complex for this problem.",
      diagnostics: { confusionScore, complexityScore, nestedLoopSignals }
    };
  }

  return null;
}

function buildIntervention(issue) {
  const preset = {
    confusion: {
      title: "Stuck Moment Detected",
      message: `You seem stuck on ${issue.concept}. Want a 60-second reset?`,
      nextAction: "Pause and write 3 pseudocode steps before coding more."
    },
    knowledge_gap: {
      title: "Prerequisite Gap Identified",
      message: `This task depends on ${issue.diagnostics?.missingPrerequisite}. Quick refresher now?`,
      nextAction: `Review ${issue.diagnostics?.missingPrerequisite} with one tiny example, then retry.`
    },
    inefficiency: {
      title: "Simpler Path Available",
      message: `Your approach may be over-complex for ${issue.concept}.`,
      nextAction: "Aim for the smallest correct pattern first, then optimize."
    }
  }[issue.type];

  const focusConcept = issue.diagnostics?.missingPrerequisite || issue.concept;
  const node = conceptGraph[focusConcept] || conceptGraph[issue.concept];

  return {
    id: createSessionId(),
    ts: Date.now(),
    applied: false,
    type: issue.type,
    severity: issue.severity,
    concept: issue.concept,
    reason: issue.reason,
    diagnostics: issue.diagnostics,
    title: preset.title,
    message: preset.message,
    nextAction: preset.nextAction,
    miniLesson: `${focusConcept}: ${node?.refresher || "Practice a small version of this concept first."}`,
    shortExample: node?.example || "function solve() { return null; }",
    quickPractice: `Try one tiny ${focusConcept} example from memory, then explain each line out loud.`
  };
}

function canEmitIntervention(session, issueType) {
  const now = Date.now();
  const cooldownByType = {
    confusion: 18000,
    knowledge_gap: 14000,
    inefficiency: 22000
  };
  const lastTs = session.lastInterventionByType[issueType] || 0;
  if (now - lastTs < (cooldownByType[issueType] || 15000)) {
    return false;
  }
  session.lastInterventionByType[issueType] = now;
  return true;
}

function bumpIssueCounters(session, issue) {
  session.issueCounters[issue.type] = (session.issueCounters[issue.type] || 0) + 1;
  const stats = ensureConceptStats(session, issue.concept);
  if (issue.type === "confusion" || issue.type === "knowledge_gap") {
    stats.confusionSignals += 1;
  } else if (issue.type === "inefficiency") {
    stats.inefficiencyFlags += 1;
  }
}

function ensureConceptStats(session, concept) {
  if (!session.conceptStats[concept]) {
    session.conceptStats[concept] = {
      incorrect: 0,
      correct: 0,
      confusionSignals: 0,
      inefficiencyFlags: 0
    };
  }
  return session.conceptStats[concept];
}

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
    feedback: "No evaluator configured for this problem."
  };
}

function getPrerequisiteGaps(targetConcept, masteryByConcept) {
  const visited = new Set();
  const gaps = [];

  function walk(concept) {
    if (!concept || visited.has(concept)) {
      return;
    }
    visited.add(concept);
    const node = conceptGraph[concept];
    if (!node) {
      return;
    }

    node.requires.forEach((prereq) => {
      const mastery = masteryByConcept[prereq] ?? 0.5;
      if (mastery < 0.62) {
        gaps.push({
          concept,
          missingPrerequisite: prereq,
          mastery: Number(mastery.toFixed(2))
        });
      }
      walk(prereq);
    });
  }

  walk(targetConcept);
  return gaps;
}

function buildImprovementSuggestions(struggledConcepts, prerequisiteGaps) {
  const suggestions = [];
  if (struggledConcepts[0]) {
    suggestions.push(`Run a 5-minute focused drill on ${struggledConcepts[0].concept} before the next problem set.`);
  }
  if (prerequisiteGaps[0]) {
    suggestions.push(
      `Patch prerequisite gap: revisit ${prerequisiteGaps[0].missingPrerequisite} before retrying ${prerequisiteGaps[0].concept}.`
    );
  }
  suggestions.push("Use short checkpoints every 90 seconds: state your plan before writing more code.");
  return suggestions.slice(0, 3);
}

function createSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function readSession(sessionId) {
  if (typeof localStorage === "undefined") {
    return null;
  }
  const raw = localStorage.getItem(`${LOCAL_SESSION_PREFIX}${sessionId}`);
  return raw ? JSON.parse(raw) : null;
}

function writeSession(session) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(`${LOCAL_SESSION_PREFIX}${session.id}`, JSON.stringify(session));
}

export {
  endSession,
  fetchProblems,
  fetchSummary,
  isRemoteMode,
  markInterventionApplied,
  recordMetrics,
  startSession,
  submitAttempt
};
