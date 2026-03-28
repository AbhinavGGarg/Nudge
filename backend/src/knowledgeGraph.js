const conceptGraph = {
  variables: {
    requires: [],
    refresher: "Variables store values so your program can remember and update information.",
    example: "let total = 0; total += 5;"
  },
  functions: {
    requires: ["variables"],
    refresher: "Functions package logic into reusable blocks with clear inputs and outputs.",
    example: "function add(a, b) { return a + b; }"
  },
  loops: {
    requires: ["variables"],
    refresher: "Loops repeat a block of code over a sequence or while a condition is true.",
    example: "for (const n of nums) { total += n; }"
  },
  conditionals: {
    requires: ["variables"],
    refresher: "Conditionals let programs choose between branches based on true/false checks.",
    example: "if (n % 2 === 0) { total += n; }"
  },
  arrays: {
    requires: ["variables"],
    refresher: "Arrays group ordered values and are often iterated with loops.",
    example: "const nums = [2, 4, 6];"
  },
  recursion: {
    requires: ["functions", "conditionals"],
    refresher: "Recursion solves a big problem by calling the same function on a smaller case.",
    example: "if (n <= 1) return 1; return n * factorial(n - 1);"
  }
};

const problems = [
  {
    id: "loop-even-sum",
    title: "Sum Even Numbers",
    difficulty: "Foundational",
    concepts: ["loops", "conditionals", "arrays", "variables"],
    prompt:
      "Write a JavaScript function `sumEven(nums)` that returns the sum of only even numbers in an array.",
    starterCode: `function sumEven(nums) {\n  // TODO\n}`
  },
  {
    id: "recursive-factorial",
    title: "Recursive Factorial",
    difficulty: "Intermediate",
    concepts: ["recursion", "functions", "conditionals"],
    prompt:
      "Write a JavaScript function `factorial(n)` using recursion. Return 1 for the base case.",
    starterCode: `function factorial(n) {\n  // TODO\n}`
  }
];

function getProblemById(problemId) {
  return problems.find((problem) => problem.id === problemId) || null;
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
        gaps.push({ concept, missingPrerequisite: prereq, mastery: Number(mastery.toFixed(2)) });
      }
      walk(prereq);
    });
  }

  walk(targetConcept);
  return gaps;
}

function getLearningAssets(concept, focusPrerequisite) {
  const conceptNode = conceptGraph[concept];
  const prereqNode = focusPrerequisite ? conceptGraph[focusPrerequisite] : null;

  const focusText = prereqNode
    ? `Before continuing, strengthen ${focusPrerequisite}: ${prereqNode.refresher}`
    : `Focus concept: ${concept}. ${conceptNode?.refresher || "Practice the core idea with short iterations."}`;

  return {
    miniLesson: focusText,
    shortExample: prereqNode?.example || conceptNode?.example || "function solve() { return null; }",
    quickPractice: `Try this 60-second drill: write one tiny ${focusPrerequisite || concept} example from memory, then explain each line out loud.`
  };
}

function getConceptGraph() {
  return conceptGraph;
}

export {
  conceptGraph,
  getConceptGraph,
  getProblemById,
  getPrerequisiteGaps,
  getLearningAssets,
  problems
};
