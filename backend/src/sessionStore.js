import { v4 as uuidv4 } from "uuid";
import { getProblemById, getPrerequisiteGaps } from "./knowledgeGraph.js";

class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  createSession(learnerName = "Demo Student") {
    const id = uuidv4();
    const session = {
      id,
      learnerName,
      startedAt: Date.now(),
      endedAt: null,
      metricsHistory: [],
      attempts: [],
      interventions: [],
      masteryByConcept: {
        variables: 0.7,
        functions: 0.66,
        loops: 0.58,
        conditionals: 0.62,
        arrays: 0.68,
        recursion: 0.4
      },
      conceptStats: {},
      currentProblemId: "loop-even-sum",
      currentConcept: "loops",
      aggregate: {
        totalKeystrokes: 0,
        totalPauseMs: 0,
        longPauseCount: 0,
        repeatedEditBursts: 0,
        timeOnTaskMs: 0,
        unproductiveTimeMs: 0
      },
      issueCounters: {
        confusion: 0,
        knowledge_gap: 0,
        inefficiency: 0
      },
      lastInterventionByType: {}
    };

    this.sessions.set(id, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  setCurrentProblem(sessionId, problemId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }
    const problem = getProblemById(problemId);
    session.currentProblemId = problemId;
    session.currentConcept = problem?.concepts[0] || "functions";
  }

  addMetrics(sessionId, metrics) {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    session.metricsHistory.push({ ts: Date.now(), ...metrics });

    session.aggregate.totalKeystrokes += metrics.keystrokesDelta || 0;
    session.aggregate.totalPauseMs += metrics.pauseDurationMs || 0;
    session.aggregate.timeOnTaskMs = Math.max(session.aggregate.timeOnTaskMs, metrics.timeOnProblemMs || 0);

    if ((metrics.pauseDurationMs || 0) > 10000) {
      session.aggregate.longPauseCount += 1;
      session.aggregate.unproductiveTimeMs += metrics.pauseDurationMs;
    }

    if ((metrics.repeatedEdits || 0) >= 6) {
      session.aggregate.repeatedEditBursts += 1;
      session.aggregate.unproductiveTimeMs += 4000;
    }

    this.setCurrentProblem(sessionId, metrics.problemId);

    return session;
  }

  addAttempt(sessionId, attempt) {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    session.attempts.push({ ts: Date.now(), ...attempt });

    const problem = getProblemById(attempt.problemId);
    const concepts = problem?.concepts || [session.currentConcept];

    concepts.forEach((concept) => {
      if (!session.conceptStats[concept]) {
        session.conceptStats[concept] = { incorrect: 0, correct: 0, confusionSignals: 0, inefficiencyFlags: 0 };
      }

      if (attempt.isCorrect) {
        session.conceptStats[concept].correct += 1;
        session.masteryByConcept[concept] = Math.min(0.98, (session.masteryByConcept[concept] || 0.5) + 0.08);
      } else {
        session.conceptStats[concept].incorrect += 1;
        session.masteryByConcept[concept] = Math.max(0.2, (session.masteryByConcept[concept] || 0.5) - 0.06);
      }

      if (attempt.inefficient) {
        session.conceptStats[concept].inefficiencyFlags += 1;
      }
    });

    return session;
  }

  trackIssue(sessionId, issue) {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    session.issueCounters[issue.type] = (session.issueCounters[issue.type] || 0) + 1;

    if (!session.conceptStats[issue.concept]) {
      session.conceptStats[issue.concept] = { incorrect: 0, correct: 0, confusionSignals: 0, inefficiencyFlags: 0 };
    }

    if (issue.type === "confusion" || issue.type === "knowledge_gap") {
      session.conceptStats[issue.concept].confusionSignals += 1;
    }

    if (issue.type === "inefficiency") {
      session.conceptStats[issue.concept].inefficiencyFlags += 1;
    }
  }

  canEmitIntervention(sessionId, issueType) {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }

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

  addIntervention(sessionId, intervention) {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    session.interventions.push({
      id: uuidv4(),
      ts: Date.now(),
      applied: false,
      ...intervention
    });
  }

  markInterventionApplied(sessionId, interventionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    const target = session.interventions.find((entry) => entry.id === interventionId);
    if (target) {
      target.applied = true;
      const boostConcept = target.concept;
      if (boostConcept) {
        session.masteryByConcept[boostConcept] = Math.min(0.99, (session.masteryByConcept[boostConcept] || 0.5) + 0.04);
      }
    }
  }

  endSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }
    session.endedAt = Date.now();
  }

  getSummary(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const endedAt = session.endedAt || Date.now();
    const sessionLengthMs = endedAt - session.startedAt;
    const timeWastedMs = Math.min(
      sessionLengthMs,
      session.aggregate.unproductiveTimeMs + session.aggregate.repeatedEditBursts * 2500
    );

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
      durationMs: sessionLengthMs,
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

export { SessionStore };
