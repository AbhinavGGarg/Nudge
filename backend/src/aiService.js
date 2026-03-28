import OpenAI from "openai";

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function buildFallback(issue, assets) {
  const byType = {
    confusion: {
      title: "Stuck Moment Detected",
      message: `You seem stuck on ${issue.concept}. Want a 60-second reset?`,
      nextAction: "Pause and write pseudocode with 3 steps before coding again."
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
  };

  const selected = byType[issue.type] || byType.confusion;

  return {
    ...selected,
    miniLesson: assets.miniLesson,
    shortExample: assets.shortExample,
    quickPractice: assets.quickPractice
  };
}

function extractJson(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function generateIntervention({ issue, problem, metrics, sessionSnapshot, assets }) {
  const fallback = buildFallback(issue, assets);

  if (!client) {
    return fallback;
  }

  const prompt = `You are Nudge, an active learning intervention engine.
Return JSON only with keys: title, message, nextAction, miniLesson, shortExample, quickPractice.

Context:
- issueType: ${issue.type}
- severity: ${issue.severity}
- concept: ${issue.concept}
- reason: ${issue.reason}
- diagnostics: ${JSON.stringify(issue.diagnostics)}
- problem: ${problem?.title}
- prompt: ${problem?.prompt}
- metrics: ${JSON.stringify(metrics)}
- mastery: ${JSON.stringify(sessionSnapshot.masteryByConcept)}

Rules:
- Keep message under 18 words.
- Be direct, supportive, and action-oriented.
- Mention prerequisite explicitly when issueType is knowledge_gap.
- Provide a 1-minute mini lesson and one tiny practice.
`;

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }]
    });

    const text = response.choices?.[0]?.message?.content;
    const parsed = extractJson(text);

    if (!parsed) {
      return fallback;
    }

    return {
      title: parsed.title || fallback.title,
      message: parsed.message || fallback.message,
      nextAction: parsed.nextAction || fallback.nextAction,
      miniLesson: parsed.miniLesson || fallback.miniLesson,
      shortExample: parsed.shortExample || fallback.shortExample,
      quickPractice: parsed.quickPractice || fallback.quickPractice
    };
  } catch {
    return fallback;
  }
}

export { generateIntervention };
