import assert from "node:assert/strict";
import test from "node:test";
import { roadmapConfig } from "../js/config.js";
import { buildSprints } from "../js/sprints.js";
import { classifyItem, currentSprintNumber, earliestScheduledSprint } from "../js/status.js";

const sprints = buildSprints(roadmapConfig.sprints);

function classify(today, earliestSprint) {
  return classifyItem({ today, sprints, earliestSprint });
}

test("builds 26 two-week sprints from 23 November 2026", () => {
  assert.equal(sprints.length, 26);
  assert.deepEqual(sprints[0], {
    number: 1,
    title: "Sprint 1",
    start: "2026-11-23",
    end: "2026-12-06",
  });
  assert.deepEqual(sprints[1], {
    number: 2,
    title: "Sprint 2",
    start: "2026-12-07",
    end: "2026-12-20",
  });
  assert.equal(sprints[20].start, "2027-08-30");
  assert.equal(sprints[25].start, "2027-11-08");
  assert.equal(sprints[25].end, "2027-11-21");
});

test("current sprint contains today, and clamps outside the calendar", () => {
  assert.equal(currentSprintNumber("2026-11-17", sprints), 1);
  assert.equal(currentSprintNumber("2026-11-22", sprints), 1);
  assert.equal(currentSprintNumber("2026-11-23", sprints), 1);
  assert.equal(currentSprintNumber("2026-12-06", sprints), 1);
  assert.equal(currentSprintNumber("2026-12-07", sprints), 2);
  assert.equal(currentSprintNumber("2027-11-08", sprints), 26);
  assert.equal(currentSprintNumber("2027-11-21", sprints), 26);
  assert.equal(currentSprintNumber("2027-11-22", sprints), 26);
  assert.equal(currentSprintNumber("2028-01-01", sprints), 26);
});

test("current sprint matches an independent day count", () => {
  const today = "2027-04-01";
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse("2026-11-23T00:00:00Z")) / 86400000);
  const expected = Math.floor(days / 14) + 1;
  assert.equal(currentSprintNumber(today, sprints), expected);
  assert.ok(expected > 1 && expected < 26);
});

test("rejects an invalid date", () => {
  assert.throws(() => currentSprintNumber("2026-02-31", sprints), /Invalid date/);
  assert.throws(() => classify("yesterday", 1), /Invalid date/);
});

test("unscheduled items go in Later with an unscheduled status", () => {
  const result = classify("2026-11-17", null);
  assert.equal(result.column, "later");
  assert.equal(result.status, "unscheduled");
  assert.equal(result.currentSprint, 1);
  assert.equal(result.earliestSprint, null);
});

test("current, next and earlier sprints are Now", () => {
  const today = "2027-01-20";
  assert.equal(currentSprintNumber(today, sprints), 5);
  for (const earliest of [1, 5, 6]) {
    const result = classify(today, earliest);
    assert.equal(result.status, "now", `sprint ${earliest}`);
    assert.equal(result.column, "now");
  }
});

test("the following four sprints are Next", () => {
  const today = "2027-01-20";
  for (const earliest of [7, 8, 9, 10]) {
    const result = classify(today, earliest);
    assert.equal(result.status, "next", `sprint ${earliest}`);
    assert.equal(result.column, "next");
  }
});

test("sprints after the next window are Later", () => {
  const today = "2027-01-20";
  const result = classify(today, 11);
  assert.equal(result.status, "later");
  assert.equal(result.column, "later");
  assert.equal(result.earliestSprint, 11);
});

test("a demo date moves the current sprint and the bands", () => {
  const early = classify("2026-11-17", 4);
  const later = classify("2027-04-01", 4);
  assert.equal(early.status, "next");
  assert.equal(later.currentSprint, currentSprintNumber("2027-04-01", sprints));
  assert.notEqual(later.currentSprint, early.currentSprint);
  assert.equal(later.status, "now");
});

test("earliest scheduled sprint ignores stories without a sprint", () => {
  assert.equal(earliestScheduledSprint([{ sprint: null }, { sprint: 4 }, { sprint: 2 }]), 2);
  assert.equal(earliestScheduledSprint([{ sprint: null }, {}]), null);
  assert.equal(earliestScheduledSprint([]), null);
});
