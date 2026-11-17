import { formatMonthKey } from "./dates.js";
import { classifyItem, currentSprintNumber, earliestScheduledSprint } from "./status.js";
import { scheduledSpan } from "./timeline.js";

function byNumber(a, b) {
  return a.number - b.number;
}

function compareScheduled(a, b) {
  const aSprint = a.classification.earliestSprint;
  const bSprint = b.classification.earliestSprint;
  if (aSprint == null && bSprint == null) return a.item.number - b.item.number;
  if (aSprint == null) return 1;
  if (bSprint == null) return -1;
  if (aSprint !== bSprint) return aSprint - bSprint;
  return a.item.number - b.item.number;
}

export function indexRoadmap(roadmap) {
  const milestones = new Map(roadmap.milestones.map((item) => [item.number, item]));
  const features = new Map(roadmap.features.map((item) => [item.number, item]));
  const epics = new Map(roadmap.epics.map((item) => [item.number, item]));
  const featuresByMilestone = new Map();
  const epicsByFeature = new Map();
  const epicsByMilestone = new Map();
  const storiesByEpic = new Map();
  const storiesByMilestone = new Map();

  for (const feature of roadmap.features) {
    push(featuresByMilestone, feature.milestone, feature);
  }
  for (const epic of roadmap.epics) {
    push(epicsByFeature, epic.feature, epic);
    push(epicsByMilestone, epic.milestone, epic);
  }
  for (const story of roadmap.stories) {
    push(storiesByEpic, story.epic, story);
    push(storiesByMilestone, story.milestone, story);
  }

  return {
    milestones,
    features,
    epics,
    featuresByMilestone,
    epicsByFeature,
    epicsByMilestone,
    storiesByEpic,
    storiesByMilestone,
  };
}

function push(map, key, value) {
  const list = map.get(key) || [];
  list.push(value);
  map.set(key, list);
}

function columnise(entries) {
  const columns = { now: [], next: [], later: [] };
  for (const entry of entries) columns[entry.classification.column].push(entry);
  for (const column of Object.keys(columns)) columns[column].sort(compareScheduled);
  return columns;
}

function matchesQuery(parts, query) {
  if (!query) return true;
  const haystack = parts.filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query);
}

function prepare(item, stories, today, sprints) {
  const earliestSprint = earliestScheduledSprint(stories);
  return {
    item,
    stories,
    classification: classifyItem({ today, sprints, earliestSprint }),
    span: scheduledSpan(stories, sprints),
  };
}

function storyMatches(story, index, milestoneNumber, query) {
  if (milestoneNumber && story.milestone !== milestoneNumber) return false;
  if (!query) return true;
  const epic = index.epics.get(story.epic);
  const feature = index.features.get(story.feature);
  const milestone = index.milestones.get(story.milestone);
  return matchesQuery(
    [story.title, story.body, epic?.title, feature?.title, milestone?.title, story.sprint ? `Sprint ${story.sprint}` : ""],
    query,
  );
}

export function buildViewModel(roadmap, { today, milestone = "", query = "" } = {}) {
  const sprints = roadmap.sprints;
  const index = indexRoadmap(roadmap);
  const currentSprintNumberValue = currentSprintNumber(today, sprints);
  const currentSprint = sprints.find((sprint) => sprint.number === currentSprintNumberValue);
  const milestoneNumber = milestone ? Number(milestone) : null;
  const normalisedQuery = query.trim().toLowerCase();

  const milestoneEntries = roadmap.milestones.map((milestoneItem) => {
    const stories = index.storiesByMilestone.get(milestoneItem.number) || [];
    return prepare(milestoneItem, stories, today, sprints);
  }).filter((entry) => {
    if (milestoneNumber && entry.item.number !== milestoneNumber) return false;
    if (!normalisedQuery) return true;
    const features = index.featuresByMilestone.get(entry.item.number) || [];
    const epics = index.epicsByMilestone.get(entry.item.number) || [];
    return matchesQuery(
      [entry.item.title, entry.item.description, ...features.map((feature) => feature.title), ...epics.map((epic) => epic.title), ...entry.stories.map((story) => story.title)],
      normalisedQuery,
    );
  });

  const epicEntries = roadmap.epics.map((epic) => {
    const stories = index.storiesByEpic.get(epic.number) || [];
    return prepare(epic, stories, today, sprints);
  }).filter((entry) => {
    if (milestoneNumber && entry.item.milestone !== milestoneNumber) return false;
    if (!normalisedQuery) return true;
    const feature = index.features.get(entry.item.feature);
    const milestoneItem = index.milestones.get(entry.item.milestone);
    return matchesQuery(
      [entry.item.title, entry.item.body, feature?.title, milestoneItem?.title, ...entry.stories.map((story) => story.title)],
      normalisedQuery,
    );
  });

  const visibleStories = roadmap.stories
    .filter((story) => storyMatches(story, index, milestoneNumber, normalisedQuery))
    .sort((a, b) => (a.sprint ?? 999) - (b.sprint ?? 999) || a.number - b.number);

  const months = new Map();
  const unscheduledStories = [];
  for (const story of visibleStories) {
    if (!story.sprintStart) {
      unscheduledStories.push(story);
      continue;
    }
    const key = story.sprintStart.slice(0, 7);
    const bucket = months.get(key) || [];
    bucket.push(story);
    months.set(key, bucket);
  }

  const monthGroups = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, stories]) => {
      const epicIds = [...new Set(stories.map((story) => story.epic ?? 0))].sort((a, b) => a - b);
      return {
        key,
        label: formatMonthKey(key),
        sprintNumbers: [...new Set(stories.map((story) => story.sprint))].sort((a, b) => a - b),
        epics: epicIds.map((epicId) => ({
          epic: index.epics.get(epicId) || null,
          feature: index.features.get(index.epics.get(epicId)?.feature) || null,
          stories: stories.filter((story) => (story.epic ?? 0) === epicId).sort(byNumber),
        })),
      };
    });

  return {
    today,
    index,
    currentSprint,
    beforeFirst: today < sprints[0].start,
    afterLast: today > sprints[sprints.length - 1].end,
    milestones: [...milestoneEntries].sort(compareScheduled),
    milestoneColumns: columnise(milestoneEntries),
    epicColumns: columnise(epicEntries),
    monthGroups,
    unscheduledStories,
    counts: {
      milestones: milestoneEntries.length,
      epics: epicEntries.length,
      stories: visibleStories.length,
    },
  };
}
