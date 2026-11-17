import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { roadmapConfig, roadmapServiceName } from "../js/config.js";
import { resolveToday } from "../js/query.js";
import { buildSprints } from "../js/sprints.js";
import { classifyItem, currentSprintNumber } from "../js/status.js";
import { buildViewModel } from "../js/view-model.js";
import { renderResults, viewCopy } from "../js/render.js";

const sprints = buildSprints(roadmapConfig.sprints);

function story(number, epic, feature, milestone, sprint) {
  const calendar = sprints.find((item) => item.number === sprint);
  return {
    number,
    title: `Story ${number}`,
    body: number === 26 ? "<script>alert(1)</script>" : "As a user",
    url: `https://example/${number}`,
    state: "open",
    labels: ["story"],
    milestone,
    feature,
    epic,
    sprint,
    sprintStart: calendar?.start ?? null,
    sprintEnd: calendar?.end ?? null,
  };
}

const roadmap = {
  generatedAt: "2026-11-17T12:00:00.000Z",
  source: {
    repoUrl: "https://github.com/GregFowler/Demo-Product-Map-Repo",
    projectUrl: "https://github.com/users/GregFowler/projects/2",
    sprintAssignments: "github_project",
  },
  sprints,
  milestones: [
    { number: 1, title: "Outcome 1", description: "Find data", dueOn: "2027-03-31", url: "https://example/m/1", state: "open" },
    { number: 2, title: "Outcome 2", description: "Govern data <script>", dueOn: "2027-06-30", url: "https://example/m/2", state: "open" },
    { number: 3, title: "Outcome 3", description: "", dueOn: null, url: "https://example/m/3", state: "open" },
  ],
  features: [
    { number: 1, title: "Feature catalogue", body: "", url: "https://example/1", state: "open", labels: ["feature"], milestone: 1 },
  ],
  epics: [
    { number: 8, title: "Epic search", body: "Search datasets", url: "https://example/8", state: "open", labels: ["epic"], milestone: 1, feature: 1 },
    { number: 14, title: "Epic quality", body: "Quality", url: "https://example/14", state: "open", labels: ["epic"], milestone: 2, feature: null },
  ],
  stories: [
    story(26, 8, 1, 1, 1),
    story(27, 8, 1, 1, 4),
    story(44, 14, null, 2, 9),
  ],
};

test("milestones and epics use the earliest child story sprint", () => {
  const today = "2026-11-17";
  const model = buildViewModel(roadmap, { today });
  assert.equal(model.currentSprint.number, 1);
  assert.equal(model.beforeFirst, true);
  const outcome1 = model.milestoneColumns.now.find((entry) => entry.item.number === 1);
  assert.ok(outcome1);
  assert.equal(outcome1.classification.earliestSprint, 1);
  assert.deepEqual(
    model.milestoneColumns.later.map((entry) => [entry.item.number, entry.classification.status]),
    [[2, "later"], [3, "unscheduled"]],
  );
  const search = model.epicColumns.now.find((entry) => entry.item.number === 8);
  assert.equal(search.classification.status, "now");
  const quality = model.epicColumns.later.find((entry) => entry.item.number === 14);
  assert.equal(quality.classification.status, classifyItem({ today, sprints, earliestSprint: 9 }).status);
});

test("a demo date repositions the same epic", () => {
  const early = buildViewModel(roadmap, { today: "2026-11-17" });
  const later = buildViewModel(roadmap, { today: "2027-04-01" });
  const earlyQuality = [...early.epicColumns.now, ...early.epicColumns.next, ...early.epicColumns.later]
    .find((entry) => entry.item.number === 14);
  const laterQuality = [...later.epicColumns.now, ...later.epicColumns.next, ...later.epicColumns.later]
    .find((entry) => entry.item.number === 14);
  assert.equal(later.currentSprint.number, currentSprintNumber("2027-04-01", sprints));
  assert.notEqual(earlyQuality.classification.status, laterQuality.classification.status);
  assert.equal(laterQuality.classification.status, "now");
});

test("stories are grouped by the month the sprint starts", () => {
  const model = buildViewModel(roadmap, { today: "2026-11-17" });
  assert.equal(model.monthGroups[0].key, "2026-11");
  assert.equal(model.monthGroups[0].label, "November 2026");
  assert.deepEqual(model.monthGroups[0].sprintNumbers, [1]);
  assert.equal(model.monthGroups[0].epics[0].epic.number, 8);
  assert.equal(model.monthGroups[1].key, "2027-01");
  assert.equal(model.monthGroups[1].stories ? undefined : model.monthGroups[1].epics[0].stories[0].number, 27);
});

test("milestone filter and search narrow the stories", () => {
  const byMilestone = buildViewModel(roadmap, { today: "2026-11-17", milestone: "2" });
  assert.equal(byMilestone.counts.milestones, 1);
  assert.equal(byMilestone.counts.stories, 1);
  assert.equal(byMilestone.monthGroups[0].epics[0].stories[0].number, 44);
  const bySearch = buildViewModel(roadmap, { today: "2026-11-17", query: "quality" });
  assert.equal(bySearch.counts.epics, 1);
  assert.equal(bySearch.epicColumns.now.concat(bySearch.epicColumns.next, bySearch.epicColumns.later)[0].item.number, 14);
});

function monthSection(html, heading) {
  const sections = html.split("<details").slice(1).map((part) => `<details${part.split("</details>")[0]}`);
  const section = sections.find((part) => part.includes(`>${heading}<`));
  assert.ok(section, `missing month section ${heading}`);
  return section;
}

test("rendered milestone detail escapes markdown and lists child sprints", () => {
  const model = buildViewModel(roadmap, { today: "2026-11-17" });
  const html = renderResults(model, "milestones", roadmap);
  assert.match(html, /Outcome 1/);
  assert.match(html, /Show description and child items/);
  assert.match(html, /Story 26/);
  assert.match(html, /Sprint 1/);
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(
    html,
    /<h3 class="govuk-summary-card__title"><a class="govuk-link roadmap-card__title-link" href="https:\/\/example\/m\/1">Outcome 1<span class="govuk-visually-hidden"> on GitHub<\/span><\/a><\/h3>/,
  );
  assert.equal(html.includes("View on GitHub"), false);
  assert.equal(html.includes("govuk-summary-card__actions"), false);
  const stories = renderResults(model, "stories", roadmap);
  assert.match(stories, /November 2026/);
  assert.match(stories, /Epic search/);
  assert.equal(stories.includes("app-timeline"), false);
  assert.equal(stories.includes("Scroll sideways"), false);
  const november = monthSection(stories, "November 2026");
  assert.match(november, /<details class="govuk-details app-month" open>/);
  assert.match(november, /Sprint 1 \(23 November 2026 to 6 December 2026\)/);
  assert.match(november, /href="https:\/\/example\/8"/);
  assert.match(november, /href="https:\/\/example\/26"/);
  assert.match(november, /<strong class="govuk-tag">Sprint 1<\/strong>/);
  const january = monthSection(stories, "January 2027");
  assert.match(january, /<details class="govuk-details app-month">/);
  assert.doesNotMatch(january, / open>/);
  const epics = renderResults(model, "epics", roadmap);
  assert.match(epics, /Feature catalogue/);
  assert.match(epics, /Outcome 1/);
  assert.match(
    epics,
    /<h3 class="govuk-summary-card__title"><a class="govuk-link roadmap-card__title-link" href="https:\/\/example\/8">Epic search<span class="govuk-visually-hidden"> on GitHub<\/span><\/a><\/h3>/,
  );
  assert.equal(epics.includes("View on GitHub"), false);
});

test("story months open for the current month and for current-sprint work", () => {
  const duringFirstSprint = renderResults(buildViewModel(roadmap, { today: "2026-12-01" }), "stories", roadmap);
  assert.match(monthSection(duringFirstSprint, "November 2026"), / open>/);
  assert.doesNotMatch(monthSection(duringFirstSprint, "January 2027"), / open>/);

  const januaryToday = renderResults(buildViewModel(roadmap, { today: "2027-01-18" }), "stories", roadmap);
  assert.match(monthSection(januaryToday, "January 2027"), / open>/);
  assert.match(monthSection(januaryToday, "January 2027"), /Sprint 4 \(4 January 2027 to 17 January 2027\)/);
  assert.doesNotMatch(monthSection(januaryToday, "November 2026"), / open>/);
});

test("the service name follows the configured repository", async () => {
  assert.equal(roadmapServiceName(), "Product roadmap for Demo-Product-Map-Repo");
  assert.equal(roadmapServiceName({ repo: "Example-Repo" }), "Product roadmap for Example-Repo");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const name = roadmapServiceName();
  assert.match(html, new RegExp(`<title>${name}</title>`));
  assert.match(html, new RegExp(`id="service-name"[^>]*>${name}</a>`));
  assert.match(html, new RegExp(`id="service-caption">${name}</span>`));
  assert.equal(html.includes('id="search"'), false);
  assert.equal(html.includes("View as of"), false);
  assert.match(html, /id="milestone-filter"/);
  const css = await readFile(new URL("../css/app.css", import.meta.url), "utf8");
  assert.match(css, /max-width:\s*1200px/);
  assert.equal(css.includes("overflow-x"), false);
});

test("count labels use story, epic and milestone plurals", () => {
  assert.match(viewCopy("stories", { stories: 1 }).intro, /1 story\./);
  assert.match(viewCopy("stories", { stories: 45 }).intro, /45 stories\./);
  assert.doesNotMatch(viewCopy("stories", { stories: 45 }).intro, /storys/);
  assert.match(viewCopy("epics", { epics: 1 }).intro, /1 epic\./);
  assert.match(viewCopy("epics", { epics: 18 }).intro, /18 epics\./);
  assert.match(viewCopy("milestones", { milestones: 1 }).intro, /1 milestone\./);
  assert.match(viewCopy("milestones", { milestones: 3 }).intro, /3 milestones\./);
});

test("date query override and invalid dates", () => {
  assert.deepEqual(resolveToday("2027-04-01", "2026-11-17"), {
    today: "2027-04-01",
    override: true,
    error: "",
  });
  const invalid = resolveToday("2027-02-31", "2026-11-17");
  assert.equal(invalid.today, "2026-11-17");
  assert.equal(invalid.override, false);
  assert.match(invalid.error, /not valid/);
  assert.equal(resolveToday("", "2026-11-17").today, "2026-11-17");
});
