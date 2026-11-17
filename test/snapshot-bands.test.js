import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildViewModel } from "../js/view-model.js";

const roadmap = JSON.parse(await readFile(new URL("../data/roadmap.json", import.meta.url), "utf8"));

function milestone(model, number) {
  return ["now", "next", "later"]
    .flatMap((column) => model.milestoneColumns[column])
    .find((entry) => entry.item.number === number);
}

test("committed snapshot places the three outcomes for Sprint 1", () => {
  const model = buildViewModel(roadmap, { today: "2026-11-17" });
  assert.equal(model.currentSprint.number, 1);
  assert.equal(model.beforeFirst, true);
  assert.deepEqual(
    [1, 2, 3].map((number) => {
      const entry = milestone(model, number);
      return [number, entry.classification.status, entry.classification.earliestSprint];
    }),
    [
      [1, "now", 1],
      [2, "next", 3],
      [3, "later", 7],
    ],
  );
});

test("18 January 2027 moves Outcome 2 to Now and Outcome 3 to Next", () => {
  const model = buildViewModel(roadmap, { today: "2027-01-18" });
  assert.equal(model.currentSprint.number, 5);
  assert.equal(milestone(model, 1).classification.status, "now");
  assert.equal(milestone(model, 2).classification.status, "now");
  assert.equal(milestone(model, 3).classification.status, "next");
});
