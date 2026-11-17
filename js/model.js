import { dateOnly } from "./dates.js";
import { buildSprints, mergeSprintCalendar } from "./sprints.js";

function normaliseBody(body) {
  return String(body || "").replaceAll("\r\n", "\n");
}

function sprintInfo(number, sprintByIssue, sprints) {
  const assigned = sprintByIssue.get(number);
  if (!assigned || !Number.isInteger(assigned.number)) {
    return { sprint: null, sprintStart: null, sprintEnd: null };
  }
  const calendar = sprints.find((sprint) => sprint.number === assigned.number);
  return {
    sprint: assigned.number,
    sprintStart: assigned.start || calendar?.start || null,
    sprintEnd: assigned.end || calendar?.end || null,
  };
}

function kindOf(issue, labels) {
  const names = issue.labels || [];
  if (names.includes(labels.story)) return "story";
  if (names.includes(labels.epic)) return "epic";
  if (names.includes(labels.feature)) return "feature";
  return "other";
}

/**
 * Build the snapshot document from normalised issues, parent links and sprint assignments.
 * `parents` maps a child issue number to its parent issue number.
 * `sprintByIssue` maps a story number to `{ number, start, end }`.
 */
export function assembleRoadmap({
  config,
  generatedAt,
  issueSource,
  sprintAssignments,
  milestones,
  issues,
  parents,
  sprintByIssue,
  projectIterations,
}) {
  const configured = buildSprints(config.sprints);
  const merged = mergeSprintCalendar(configured, projectIterations);
  const sprints = merged.sprints;
  const parentOf = parents instanceof Map ? parents : new Map(Object.entries(parents || {}).map(([key, value]) => [Number(key), value]));
  const assignments = sprintByIssue instanceof Map ? sprintByIssue : new Map();

  const featureNumbers = new Set();
  const epicNumbers = new Set();
  for (const issue of issues) {
    const kind = kindOf(issue, config.labels);
    if (kind === "feature") featureNumbers.add(issue.number);
    if (kind === "epic") epicNumbers.add(issue.number);
  }

  const epicFeature = new Map();
  for (const issue of issues) {
    if (kindOf(issue, config.labels) !== "epic") continue;
    const parent = parentOf.get(issue.number) ?? null;
    epicFeature.set(issue.number, featureNumbers.has(parent) ? parent : null);
  }

  const features = [];
  const epics = [];
  const stories = [];
  const ignored = [];

  for (const issue of [...issues].sort((a, b) => a.number - b.number)) {
    const kind = kindOf(issue, config.labels);
    const base = {
      number: issue.number,
      title: issue.title,
      body: normaliseBody(issue.body),
      url: issue.url,
      state: String(issue.state || "open").toLowerCase(),
      labels: [...(issue.labels || [])].sort(),
      milestone: issue.milestone ?? null,
    };
    if (kind === "feature") {
      features.push(base);
    } else if (kind === "epic") {
      epics.push({ ...base, feature: epicFeature.get(issue.number) ?? null });
    } else if (kind === "story") {
      const parent = parentOf.get(issue.number) ?? null;
      const epic = epicNumbers.has(parent) ? parent : null;
      const feature = epic == null ? null : epicFeature.get(epic) ?? null;
      stories.push({
        ...base,
        feature,
        epic,
        ...sprintInfo(issue.number, assignments, sprints),
      });
    } else {
      ignored.push(issue.number);
    }
  }

  return {
    generatedAt,
    source: {
      owner: config.owner,
      repo: config.repo,
      repoUrl: `https://github.com/${config.owner}/${config.repo}`,
      projectLogin: config.projectLogin,
      projectOwnerType: config.projectOwnerType,
      projectNumber: config.projectNumber,
      projectUrl: config.projectUrl,
      projectTitle: config.projectTitle,
      iterationField: config.iterationFieldName,
      issueSource,
      sprintAssignments,
      sprintCalendar: merged.adjusted ? "github_project" : "config",
    },
    sprints,
    milestones: [...milestones]
      .map((milestone) => ({
        number: milestone.number,
        title: milestone.title,
        description: normaliseBody(milestone.description),
        dueOn: dateOnly(milestone.dueOn),
        url: milestone.url,
        state: String(milestone.state || "open").toLowerCase(),
      }))
      .sort((a, b) => a.number - b.number),
    features,
    epics,
    stories,
    ignoredIssueNumbers: ignored,
  };
}

export function assignmentsFromSprintPlan(plan, sprints) {
  const sprintByIssue = new Map();
  const parents = new Map();
  for (const row of plan || []) {
    const calendar = sprints.find((sprint) => sprint.number === row.sprint);
    if (Number.isInteger(row.sprint)) {
      sprintByIssue.set(row.issue_number, {
        number: row.sprint,
        start: row.sprint_start || calendar?.start || null,
        end: calendar?.end || null,
      });
    }
    if (row.epic && row.feature && !parents.has(row.epic)) {
      parents.set(row.epic, row.feature);
    }
    if (row.issue_number && row.epic && !parents.has(row.issue_number)) {
      parents.set(row.issue_number, row.epic);
    }
  }
  return { sprintByIssue, parents };
}
