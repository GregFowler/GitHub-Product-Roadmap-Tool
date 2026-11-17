import assert from "node:assert/strict";
import test from "node:test";
import { roadmapConfig } from "../js/config.js";
import { assembleRoadmap } from "../js/model.js";
import { buildSprints } from "../js/sprints.js";

const sprints = buildSprints(roadmapConfig.sprints);

test("assembles parent links, milestones and sprint dates", () => {
  const roadmap = assembleRoadmap({
    config: roadmapConfig,
    generatedAt: "2026-11-17T12:00:00.000Z",
    issueSource: "rest",
    sprintAssignments: "sprint_plan",
    milestones: [
      {
        number: 1,
        title: "Outcome 1",
        description: "Find data",
        dueOn: "2027-03-31T00:00:00Z",
        url: "https://github.com/example/milestone/1",
        state: "open",
      },
    ],
    issues: [
      { number: 1, title: "Feature: Catalogue", body: "Parent feature text", url: "https://example/1", state: "open", labels: ["feature", "priority: high"], milestone: 1 },
      { number: 8, title: "Epic: Search", body: "Search", url: "https://example/8", state: "OPEN", labels: ["epic"], milestone: 1 },
      { number: 26, title: "Search datasets", body: "As a user\n\nSee #8", url: "https://example/26", state: "open", labels: ["story"], milestone: 1 },
      { number: 99, title: "Note", body: "", url: "https://example/99", state: "open", labels: ["question"], milestone: null },
    ],
    parents: new Map([[8, 1], [26, 8]]),
    sprintByIssue: new Map([[26, { number: 1, start: "2026-11-23", end: "2026-12-06" }]]),
    projectIterations: [],
  });

  assert.equal(roadmap.milestones[0].dueOn, "2027-03-31");
  assert.equal(roadmap.features[0].labels.join(","), "feature,priority: high");
  assert.equal(roadmap.epics[0].feature, 1);
  assert.equal(roadmap.epics[0].state, "open");
  assert.deepEqual(
    {
      feature: roadmap.stories[0].feature,
      epic: roadmap.stories[0].epic,
      sprint: roadmap.stories[0].sprint,
      sprintStart: roadmap.stories[0].sprintStart,
      sprintEnd: roadmap.stories[0].sprintEnd,
    },
    { feature: 1, epic: 8, sprint: 1, sprintStart: "2026-11-23", sprintEnd: "2026-12-06" },
  );
  assert.deepEqual(roadmap.ignoredIssueNumbers, [99]);
  assert.equal(roadmap.sprints.length, sprints.length);
  assert.equal(roadmap.source.sprintCalendar, "config");
});

test("project iteration dates replace the configured calendar when they differ", () => {
  const roadmap = assembleRoadmap({
    config: roadmapConfig,
    generatedAt: "2026-11-17T12:00:00.000Z",
    issueSource: "graphql",
    sprintAssignments: "github_project",
    milestones: [],
    issues: [],
    parents: new Map(),
    sprintByIssue: new Map(),
    projectIterations: [{ title: "Sprint 1", startDate: "2026-11-24", duration: 14 }],
  });
  assert.equal(roadmap.sprints[0].start, "2026-11-24");
  assert.equal(roadmap.sprints[0].end, "2026-12-07");
  assert.equal(roadmap.source.sprintCalendar, "github_project");
});
