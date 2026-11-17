import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { roadmapConfig } from "../js/config.js";
import { buildSprints } from "../js/sprints.js";
import {
  barPlacement,
  dateFraction,
  monthColumns,
  quarterColumns,
  scheduledSpan,
  timelineScale,
  yearColumns,
} from "../js/timeline.js";

const sprints = buildSprints(roadmapConfig.sprints);

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} is not ${expected}`);
}

function story(sprint, extra = {}) {
  return { sprint, ...extra };
}

test("a milestone span runs from the earliest sprint start to the latest sprint end", () => {
  const span = scheduledSpan([
    story(4),
    story(null),
    story(1),
    { title: "No sprint" },
  ], sprints);
  assert.deepEqual(span, {
    earliestSprint: 1,
    latestSprint: 4,
    start: "2026-11-23",
    end: "2027-01-17",
  });
});

test("sprint order comes from the sprint number, not a story date field", () => {
  const span = scheduledSpan([
    story(1, { sprintStart: "2027-06-01", sprintEnd: "2027-06-14" }),
    story(3, { sprintStart: "2026-01-01", sprintEnd: "2026-01-14" }),
  ], sprints);
  assert.equal(span.start, "2026-11-23");
  assert.equal(span.end, "2027-01-03");
  assert.equal(span.earliestSprint, 1);
  assert.equal(span.latestSprint, 3);
});

test("a milestone with no scheduled stories has no span", () => {
  assert.equal(scheduledSpan([], sprints), null);
  assert.equal(scheduledSpan([story(null), { sprint: undefined }], sprints), null);
  assert.equal(scheduledSpan(null, sprints), null);
});

test("story dates are used only when the sprint is missing from the calendar", () => {
  const span = scheduledSpan([
    story(2, { sprintStart: "2026-12-07", sprintEnd: "2026-12-20" }),
    story(8, { sprintStart: "2027-03-01", sprintEnd: "2027-03-14" }),
  ], [sprints[1]]);
  assert.deepEqual(span, {
    earliestSprint: 2,
    latestSprint: 8,
    start: "2026-12-07",
    end: "2027-03-14",
  });
  assert.equal(scheduledSpan([story(8)], []), null);
});

test("the shared axis uses equal months and places a bar inside them", () => {
  const months = monthColumns("2026-11-17", "2027-03-28");
  assert.deepEqual(months.map((month) => month.label), ["Nov", "Dec", "Jan", "Feb", "Mar"]);
  assert.deepEqual(yearColumns(months).map((year) => [year.label, year.span]), [["2026", 2], ["2027", 3]]);
  assert.deepEqual(quarterColumns(months).map((quarter) => [quarter.label, quarter.span]), [
    ["Q4 ’26", 2],
    ["Q1 ’27", 3],
  ]);
  close(dateFraction("2026-11-23", months, "start"), (22 / 30) / 5);
  close(dateFraction("2027-01-17", months, "end"), (2 + 17 / 31) / 5);
  const bar = barPlacement("2026-11-23", "2027-01-17", months);
  close(bar.left, (22 / 30) / 5);
  close(bar.width, (2 + 17 / 31) / 5 - (22 / 30) / 5);
  assert.equal(bar.align, "start");
  const late = barPlacement("2027-03-15", "2027-03-28", months);
  assert.equal(late.align, "end");
});

test("the today marker follows the date override", () => {
  const spans = [{ start: "2026-11-23", end: "2027-03-28" }];
  const early = timelineScale(spans, "2026-11-17");
  const later = timelineScale(spans, "2027-01-18");
  assert.equal(early.months[0].key, "2026-11");
  assert.equal(early.months.at(-1).key, "2027-03");
  close(early.todayFraction, (16 / 30) / 5);
  close(later.todayFraction, (2 + 17 / 31) / 5);
  assert.ok(later.todayFraction > early.todayFraction);
});

test("committed outcomes span their earliest and latest story sprints", async () => {
  const roadmap = JSON.parse(await readFile(new URL("../data/roadmap.json", import.meta.url), "utf8"));
  const expected = {
    1: { earliestSprint: 1, latestSprint: 9, start: "2026-11-23", end: "2027-03-28" },
    2: { earliestSprint: 3, latestSprint: 13, start: "2026-12-21", end: "2027-05-23" },
    3: { earliestSprint: 7, latestSprint: 16, start: "2027-02-15", end: "2027-07-04" },
  };
  for (const milestone of roadmap.milestones) {
    const stories = roadmap.stories.filter((story) => story.milestone === milestone.number);
    assert.deepEqual(scheduledSpan(stories, roadmap.sprints), expected[milestone.number]);
  }
});
