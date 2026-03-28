import { getPrerequisiteGaps, getProblemById } from "./knowledgeGraph.js";

function detectIssue(session, metricsPayload) {
  if (!session) {
    return null;
  }

  const {
    problemId,
    typingSpeed = 0,
    pauseDurationMs = 0,
    repeatedEdits = 0,
    deletionRate = 0,
    timeOnProblemMs = 0,
    complexityScore = 0,
    nestedLoopSignals = 0
  } = metricsPayload;

  const problem = getProblemById(problemId);
  const concept = session.currentConcept || problem?.concepts[0] || "functions";
  const recentAttempts = session.attempts.filter((attempt) => attempt.problemId === problemId).slice(-3);
  const incorrectAttempts = recentAttempts.filter((attempt) => !attempt.isCorrect).length;

  const confusionSignals = [];
  if (pauseDurationMs > 11000) {
    confusionSignals.push("long_pause");
  }
  if (repeatedEdits >= 6 || deletionRate > 0.32) {
    confusionSignals.push("churn_editing");
  }
  if (typingSpeed < 1.1 && timeOnProblemMs > 60000) {
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

  const inefficiencyDetected =
    complexityScore > 0.72 || nestedLoopSignals > 0 || (timeOnProblemMs > 150000 && typingSpeed < 1.5);

  const prerequisiteGaps = getPrerequisiteGaps(concept, session.masteryByConcept);

  if (prerequisiteGaps.length > 0 && (incorrectAttempts >= 1 || confusionSignals.length >= 2)) {
    const gap = prerequisiteGaps[0];
    return {
      type: "knowledge_gap",
      severity: confusionScore > 0.72 ? "high" : "medium",
      concept,
      reason: `Current task relies on ${gap.missingPrerequisite}, but mastery is low (${gap.mastery}).`,
      diagnostics: {
        confusionSignals,
        incorrectAttempts,
        confusionScore,
        missingPrerequisite: gap.missingPrerequisite
      }
    };
  }

  if (confusionSignals.length >= 2 || confusionScore > 0.64) {
    return {
      type: "confusion",
      severity: confusionScore > 0.82 ? "high" : "medium",
      concept,
      reason: "Student behavior indicates they may be stuck or uncertain.",
      diagnostics: {
        confusionSignals,
        incorrectAttempts,
        confusionScore
      }
    };
  }

  if (inefficiencyDetected) {
    return {
      type: "inefficiency",
      severity: complexityScore > 0.8 ? "medium" : "low",
      concept,
      reason: "Solution path appears over-complex for the target concept.",
      diagnostics: {
        complexityScore,
        nestedLoopSignals,
        timeOnProblemMs
      }
    };
  }

  return null;
}

export { detectIssue };
