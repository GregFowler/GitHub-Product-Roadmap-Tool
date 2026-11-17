import { addDays, dateOnly } from "./dates.js";
import { assembleRoadmap, assignmentsFromSprintPlan } from "./model.js";
import { buildSprints, sprintNumberFromTitle } from "./sprints.js";

const USER_AGENT = "product-roadmap-snapshot";

async function graphql(token, query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors) {
    const message = payload.errors?.map((error) => error.message).join("; ") || `HTTP ${response.status}`;
    throw new Error(`GitHub GraphQL: ${message}`);
  }
  return payload.data;
}

async function restJson(token, path) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": USER_AGENT,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub REST ${response.status} for ${path}: ${text.slice(0, 180)}`);
  }
  return response.json();
}

function projectSelection(ownerType) {
  return ownerType === "organization" ? "organization" : "user";
}

const ISSUE_QUERY = `
  query($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      milestones(first: 100, states: [OPEN, CLOSED]) {
        nodes { number title description dueOn url state }
      }
      issues(first: 100, after: $cursor, states: [OPEN, CLOSED], orderBy: { field: CREATED_AT, direction: ASC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          body
          url
          state
          labels(first: 20) { nodes { name } }
          milestone { number }
          parent { number }
        }
      }
    }
  }
`;

function projectQuery(ownerType) {
  const root = projectSelection(ownerType);
  return `
    query($login: String!, $number: Int!, $field: String!, $cursor: String) {
      ${root}(login: $login) {
        projectV2(number: $number) {
          title
          url
          field(name: $field) {
            ... on ProjectV2IterationField {
              configuration {
                iterations { title startDate duration }
                completedIterations { title startDate duration }
              }
            }
          }
          items(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes {
              content { ... on Issue { number } }
              fieldValueByName(name: $field) {
                ... on ProjectV2ItemFieldIterationValue {
                  title
                  startDate
                  duration
                }
              }
            }
          }
        }
      }
    }
  `;
}

function normaliseGraphqlIssue(node) {
  return {
    number: node.number,
    title: node.title,
    body: node.body || "",
    url: node.url,
    state: String(node.state || "OPEN").toLowerCase(),
    labels: (node.labels?.nodes || []).map((label) => label.name),
    milestone: node.milestone?.number ?? null,
    parent: node.parent?.number ?? null,
  };
}

async function fetchViaGraphql(config, token) {
  const issues = [];
  let milestones = [];
  let cursor = null;
  do {
    const data = await graphql(token, ISSUE_QUERY, {
      owner: config.owner,
      name: config.repo,
      cursor,
    });
    const repository = data.repository;
    if (!repository) throw new Error(`Repository ${config.owner}/${config.repo} was not found.`);
    if (milestones.length === 0) milestones = repository.milestones?.nodes || [];
    const connection = repository.issues;
    for (const node of connection.nodes) issues.push(normaliseGraphqlIssue(node));
    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);

  const parents = new Map();
  for (const issue of issues) {
    if (issue.parent != null) parents.set(issue.number, issue.parent);
  }

  const iterations = [];
  const sprintByIssue = new Map();
  let itemCursor = null;
  const query = projectQuery(config.projectOwnerType);
  do {
    const data = await graphql(token, query, {
      login: config.projectLogin,
      number: config.projectNumber,
      field: config.iterationFieldName,
      cursor: itemCursor,
    });
    const root = data.user || data.organization;
    const project = root?.projectV2;
    if (!project) {
      throw new Error(`GitHub project ${config.projectLogin} #${config.projectNumber} was not found.`);
    }
    const configuration = project.field?.configuration;
    if (!configuration && iterations.length === 0) {
      throw new Error(`Project field "${config.iterationFieldName}" is not an iteration field.`);
    }
    if (iterations.length === 0 && configuration) {
      iterations.push(...(configuration.iterations || []), ...(configuration.completedIterations || []));
    }
    for (const node of project.items.nodes) {
      const number = node.content?.number;
      const value = node.fieldValueByName;
      if (!number || !value?.title) continue;
      const sprintNumber = sprintNumberFromTitle(value.title);
      if (!sprintNumber) continue;
      const start = value.startDate || null;
      const end = start && Number.isInteger(value.duration) ? addDays(start, value.duration - 1) : null;
      sprintByIssue.set(number, { number: sprintNumber, start, end });
    }
    itemCursor = project.items.pageInfo.hasNextPage ? project.items.pageInfo.endCursor : null;
  } while (itemCursor);

  if (sprintByIssue.size === 0) {
    throw new Error("The project returned no sprint assignments.");
  }

  return { milestones, issues, parents, sprintByIssue, projectIterations: iterations, issueSource: "graphql", sprintAssignments: "github_project" };
}

function normaliseRestIssue(issue) {
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body || "",
    url: issue.html_url,
    state: issue.state,
    labels: (issue.labels || []).map((label) => label.name),
    milestone: issue.milestone?.number ?? null,
  };
}

async function fetchViaRest(config, token, sprintPlan) {
  const [milestonePayload, issuePayload] = await Promise.all([
    restJson(token, `/repos/${config.owner}/${config.repo}/milestones?state=all&per_page=100`),
    restJson(token, `/repos/${config.owner}/${config.repo}/issues?state=all&per_page=100`),
  ]);

  let issues = issuePayload.filter((issue) => !issue.pull_request).map(normaliseRestIssue);
  if (issuePayload.length === 100) {
    let page = 2;
    while (page < 20) {
      const next = await restJson(token, `/repos/${config.owner}/${config.repo}/issues?state=all&per_page=100&page=${page}`);
      issues.push(...next.filter((issue) => !issue.pull_request).map(normaliseRestIssue));
      if (next.length < 100) break;
      page += 1;
    }
  }

  const milestones = milestonePayload.map((milestone) => ({
    number: milestone.number,
    title: milestone.title,
    description: milestone.description || "",
    dueOn: dateOnly(milestone.due_on),
    url: milestone.html_url,
    state: milestone.state,
  }));

  const labels = config.labels;
  const parents = new Map();
  const parentsToFetch = issues.filter((issue) =>
    issue.labels.includes(labels.feature) || issue.labels.includes(labels.epic),
  );
  for (const issue of parentsToFetch) {
    const children = await restJson(
      token,
      `/repos/${config.owner}/${config.repo}/issues/${issue.number}/sub_issues?per_page=100`,
    );
    for (const child of children) {
      if (!parents.has(child.number)) parents.set(child.number, issue.number);
    }
  }

  const configured = buildSprints(config.sprints);
  const fromPlan = assignmentsFromSprintPlan(sprintPlan, configured);
  for (const [child, parent] of fromPlan.parents) {
    if (!parents.has(child)) parents.set(child, parent);
  }

  return {
    milestones,
    issues,
    parents,
    sprintByIssue: fromPlan.sprintByIssue,
    projectIterations: [],
    issueSource: "rest",
    sprintAssignments: "sprint_plan",
  };
}

export async function fetchRoadmapFromGitHub({ config, token = "", sprintPlan = [], generatedAt = new Date().toISOString() }) {
  const loaded = token
    ? await fetchViaGraphql(config, token)
    : await fetchViaRest(config, "", sprintPlan);

  const roadmap = assembleRoadmap({
    config,
    generatedAt,
    milestones: loaded.milestones,
    issues: loaded.issues,
    parents: loaded.parents,
    sprintByIssue: loaded.sprintByIssue,
    projectIterations: loaded.projectIterations,
    issueSource: loaded.issueSource,
    sprintAssignments: loaded.sprintAssignments,
  });

  if (roadmap.ignoredIssueNumbers.length > 0) {
    console.warn(`Ignored issues without a feature, epic or story label: ${roadmap.ignoredIssueNumbers.join(", ")}`);
  }
  delete roadmap.ignoredIssueNumbers;
  return roadmap;
}
