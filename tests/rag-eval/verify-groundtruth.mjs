// Verifies the eval set itself before it is used to grade anything.
// - every positive question's expected_keywords must be findable in its cited source doc
// - every negative question must have no supporting value anywhere in the KB
// Run: node tests/rag-eval/verify-groundtruth.mjs

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { contains } from "./match.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const dataDir = join(root, "data");

const suite = JSON.parse(readFileSync(join(here, "rag-eval-questions.json"), "utf8"));

const docs = new Map();
for (const relative of suite.knowledge_base) {
  const name = relative.split("/").pop();
  docs.set(name, readFileSync(join(dataDir, name), "utf8"));
}
const wholeKb = [...docs.values()].join("\n");

const problems = [];
let positives = 0;
let negatives = 0;

for (const question of suite.questions) {
  if (question.category === "negative") {
    negatives += 1;
    if (question.expected_source_doc.length) {
      problems.push(`${question.id}: negative question should have an empty expected_source_doc`);
    }
    if (question.expected_behavior !== "abstain") {
      problems.push(`${question.id}: negative question must set expected_behavior=abstain`);
    }
    if (question.expected_keywords.length) {
      problems.push(`${question.id}: negative question must not require keywords`);
    }
    if (!question.must_not_contain.length && !(question.must_not_match || []).length) {
      problems.push(`${question.id}: negative question needs a must_not_contain or must_not_match guard`);
    }
    continue;
  }

  positives += 1;
  if (!question.expected_source_doc.length) {
    problems.push(`${question.id}: positive question has no expected_source_doc`);
    continue;
  }

  const corpus = question.expected_source_doc
    .map((name) => docs.get(name.split("/").pop()))
    .filter(Boolean)
    .join("\n");

  if (!corpus) {
    problems.push(`${question.id}: cited source doc not found on disk`);
    continue;
  }

  for (const keyword of question.expected_keywords) {
    if (!contains(corpus, keyword)) {
      problems.push(`${question.id}: expected keyword "${keyword}" is NOT present in ${question.expected_source_doc.join(", ")}`);
    }
  }

  if (question.expected_chunk_anchor && !contains(corpus, question.expected_chunk_anchor)) {
    problems.push(`${question.id}: anchor "${question.expected_chunk_anchor}" not found in cited doc`);
  }

  // A positive must_not_contain guard should genuinely be a wrong answer, i.e. it must not
  // also be the correct answer sitting in the same cited chunk region.
  for (const banned of question.must_not_contain) {
    if (question.expected_keywords.some((keyword) => contains(banned, keyword) && contains(keyword, banned))) {
      problems.push(`${question.id}: must_not_contain "${banned}" collides with an expected keyword`);
    }
  }
}

// Advisory: report banned strings that also occur in the KB, so a guard that would fire on
// legitimate retrieved context gets noticed. Not a hard failure - some guards (e.g. "3 year")
// intentionally target correct-but-misapplied facts.
const advisories = [];
for (const question of suite.questions.filter((item) => item.category === "negative")) {
  for (const banned of question.must_not_contain) {
    if (contains(wholeKb, banned)) {
      advisories.push(`${question.id}: guard "${banned}" also occurs in the KB - intended only if it targets a correct-but-misapplied fact`);
    }
  }
  for (const pattern of question.must_not_match || []) {
    if (new RegExp(pattern, "i").test(wholeKb)) {
      advisories.push(`${question.id}: regex /${pattern}/i also matches KB text - verify it cannot fire on a correct abstention`);
    }
  }
}

const idCounts = new Map();
for (const question of suite.questions) {
  idCounts.set(question.id, (idCounts.get(question.id) || 0) + 1);
}
for (const [id, count] of idCounts) {
  if (count > 1) problems.push(`duplicate question id: ${id}`);
}

if (suite.questions.length !== suite.counts.total) {
  problems.push(`count mismatch: header says ${suite.counts.total}, file has ${suite.questions.length}`);
}

console.log(`Questions: ${suite.questions.length} (${positives} positive, ${negatives} negative)`);
console.log(`Documents loaded: ${docs.size}`);
console.log("");

if (advisories.length) {
  console.log(`${advisories.length} advisory note(s):`);
  for (const advisory of advisories) console.log(`  ~ ${advisory}`);
  console.log("");
}

if (!problems.length) {
  console.log("PASS - every expected fact is grounded in its cited source document.");
  process.exit(0);
}

console.log(`${problems.length} issue(s):`);
for (const problem of problems) console.log(`  - ${problem}`);
process.exit(1);
