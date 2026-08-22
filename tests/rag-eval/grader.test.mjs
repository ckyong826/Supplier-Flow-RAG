// Tests the eval's own grading logic against the real patterns stored in the fixture.
// A grader that silently never fires would report a perfect score on a broken RAG,
// so this runs as part of `npm test`.
//
// Run: node --test tests/rag-eval/grader.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { contains, matchesAny, looksLikeAbstention } from "./match.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const suite = JSON.parse(readFileSync(join(here, "rag-eval-questions.json"), "utf8"));
const question = (id) => suite.questions.find((item) => item.id === id);
const guards = (id) => question(id).must_not_match || [];

test("token boundaries keep near-duplicate specs apart", () => {
  assert.equal(contains("Residual-current type: AC", "type a"), false, "type A must not match inside type AC");
  assert.equal(contains("Residual-current type: AC", "type ac"), true, "punctuation must not block a match");
  assert.equal(contains("AC-3 motor power at 400 V", "40"), false, "40 must not match inside 400");
  assert.equal(contains("rated 40 A", "40"), true);
  assert.equal(contains("rated residual current: 300 mA", "30 mA"), false, "30 mA must not match inside 300 mA");
  assert.equal(contains("30 mA sensitivity", "30 mA"), true);
});

test("keyword alternates accept equivalent phrasings only", () => {
  assert.equal(contains("please send clear photos", "photograph|photographs|photo|photos"), true);
  assert.equal(contains("send the invoice", "photograph|photographs|photo|photos"), false);
  assert.equal(contains("within three working days", "3 working days|three working days"), true);
});

test("N01 price guards fire on a fabricated price and not on an abstention", () => {
  assert.ok(matchesAny("The A9F73140 is RM 85.50 each.", guards("N01")).length > 0);
  assert.ok(matchesAny("It costs $42.", guards("N01")).length > 0);
  assert.equal(matchesAny("I do not have pricing here; please request a quotation.", guards("N01")).length, 0);
});

test("N02 stock guards fire on a fabricated quantity", () => {
  assert.ok(matchesAny("We have 120 units available.", guards("N02")).length > 0);
  assert.equal(matchesAny("Our team confirms final stock when preparing the quotation.", guards("N02")).length, 0);
});

test("N07 temperature guards fire on a fabricated range", () => {
  assert.ok(matchesAny("Operating range is -25 °C to +55 °C.", guards("N07")).length > 0);
  assert.equal(matchesAny("That is not specified in the product record.", guards("N07")).length, 0);
});

test("N09 credit-limit guards fire on a fabricated amount", () => {
  assert.ok(matchesAny("The credit limit is RM 50,000.", guards("N09")).length > 0);
  assert.equal(matchesAny("Credit limit is set per account by our sales team.", guards("N09")).length, 0);
});

test("N10 SST guards fire on a fabricated rate", () => {
  assert.ok(matchesAny("SST is charged at 6%.", guards("N10")).length > 0);
  assert.ok(matchesAny("Add 8 % SST to the subtotal.", guards("N10")).length > 0);
  assert.equal(matchesAny("SST is confirmed before the quotation is sent.", guards("N10")).length, 0);
});

test("N04 catches a warranty figure borrowed from an unrelated product", () => {
  const banned = question("N04").must_not_contain;
  assert.ok(banned.some((value) => contains("Schneider MCBs carry a 3-year warranty.", value)));
  assert.equal(banned.some((value) => contains("Warranty is per the manufacturer where stated on the listing.", value)), false);
});

test("abstention detection separates hedged answers from confident ones", () => {
  assert.equal(looksLikeAbstention("That is not specified in our product listing."), true);
  assert.equal(looksLikeAbstention("I could not find that; our sales team can confirm."), true);
  assert.equal(looksLikeAbstention("The rated current is 40 A with a B curve."), false);
});

test("every negative question carries at least one enforceable guard", () => {
  for (const item of suite.questions.filter((entry) => entry.category === "negative")) {
    const total = item.must_not_contain.length + (item.must_not_match || []).length;
    assert.ok(total > 0, `${item.id} has no guards`);
    for (const pattern of item.must_not_match || []) {
      assert.doesNotThrow(() => new RegExp(pattern, "i"), `${item.id} has an invalid regex: ${pattern}`);
      assert.ok(!pattern.includes("\\\\"), `${item.id} regex is double-escaped and would never fire: ${pattern}`);
    }
  }
});

test("suite shape matches its declared counts", () => {
  assert.equal(suite.questions.length, suite.counts.total);
  const count = (category) => suite.questions.filter((item) => item.category === category).length;
  assert.equal(count("direct_lookup"), suite.counts.direct_lookup);
  assert.equal(count("adversarial"), suite.counts.adversarial);
  assert.equal(count("negative"), suite.counts.negative);
  assert.equal(new Set(suite.questions.map((item) => item.id)).size, suite.questions.length);
});
