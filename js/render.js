import { formatLongDate } from "./dates.js";
import { escapeHtml, plainExcerpt, renderMarkdown } from "./markdown.js";

const COLUMNS = [
  { id: "now", title: "Now", hint: "Current sprint, the next sprint, or already started" },
  { id: "next", title: "Next", hint: "Starts in the four sprints after that" },
  { id: "later", title: "Later", hint: "Starts later, or not scheduled yet" },
];

const STATUS_TEXT = {
  now: "Now",
  next: "Next",
  later: "Later",
  unscheduled: "Unscheduled",
};

const STATUS_MODIFIER = {
  now: "green",
  next: "turquoise",
  later: "grey",
  unscheduled: "orange",
};

const PLURALS = {
  feature: "features",
  epic: "epics",
  story: "stories",
  milestone: "milestones",
};

function plural(count, word) {
  const label = count === 1 ? word : PLURALS[word] || `${word}s`;
  return `${count} ${label}`;
}

function tag(text, modifier = "") {
  const className = modifier ? `govuk-tag govuk-tag--${modifier}` : "govuk-tag";
  return `<strong class="${className}">${escapeHtml(text)}</strong>`;
}

function statusTag(status) {
  return tag(STATUS_TEXT[status] || status, STATUS_MODIFIER[status] || "grey");
}

function stateTag(state) {
  return state === "closed" ? tag("Closed", "red") : "";
}

function priorityTag(labels) {
  const raw = (labels || []).find((label) => label.startsWith("priority:"));
  if (!raw) return "";
  const level = raw.split(":").slice(1).join(":").trim().toLowerCase();
  const modifier = level === "high" ? "red" : level === "medium" ? "yellow" : "grey";
  const text = `${level.charAt(0).toUpperCase()}${level.slice(1)} priority`;
  return tag(text, modifier);
}

function issueLink(url, title) {
  return `<a class="govuk-link" href="${escapeHtml(url)}">${escapeHtml(title)}</a>`;
}

function githubTitleLink(url, title, className = "") {
  const classes = ["govuk-link", className].filter(Boolean).join(" ");
  return `<a class="${classes}" href="${escapeHtml(url)}">${escapeHtml(title)}<span class="govuk-visually-hidden"> on GitHub</span></a>`;
}

function summaryList(rows) {
  const body = rows
    .map(
      ([key, valueHtml]) => `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">${escapeHtml(key)}</dt><dd class="govuk-summary-list__value">${valueHtml}</dd></div>`,
    )
    .join("");
  return `<dl class="govuk-summary-list govuk-summary-list--no-border">${body}</dl>`;
}

function sprintRangeLabel(stories) {
  const numbers = stories.map((story) => story.sprint).filter((sprint) => Number.isInteger(sprint));
  if (numbers.length === 0) return { text: "Unscheduled", modifier: "orange" };
  const earliest = Math.min(...numbers);
  const latest = Math.max(...numbers);
  if (earliest === latest) return { text: `Sprint ${earliest}`, modifier: "" };
  return { text: `Sprints ${earliest}–${latest}`, modifier: "" };
}

function descriptionHtml(markdown, issueBaseUrl) {
  const rendered = renderMarkdown(markdown, { issueBaseUrl });
  return rendered || `<p class="govuk-body">No description has been added on GitHub.</p>`;
}

function storyItems(stories) {
  if (!stories.length) return `<p class="govuk-body">No stories.</p>`;
  const items = stories
    .slice()
    .sort((a, b) => (a.sprint ?? 999) - (b.sprint ?? 999) || a.number - b.number)
    .map((story) => {
      const label = story.sprint ? `Sprint ${story.sprint}` : "Unscheduled";
      const modifier = story.sprint ? "" : "orange";
      const dates = story.sprintStart
        ? ` <span class="govuk-body-s">(${escapeHtml(formatLongDate(story.sprintStart))} to ${escapeHtml(formatLongDate(story.sprintEnd))})</span>`
        : "";
      return `<li>${issueLink(story.url, story.title)} ${tag(label, modifier)}${dates}</li>`;
    })
    .join("");
  return `<ul class="govuk-list">${items}</ul>`;
}

function renderEpicBlock(epic, index) {
  const stories = index.storiesByEpic.get(epic.number) || [];
  const range = sprintRangeLabel(stories);
  return `<li><p class="govuk-body">${issueLink(epic.url, epic.title)} ${tag(range.text, range.modifier)} ${stateTag(epic.state)}</p>${storyItems(stories)}</li>`;
}

function renderMilestoneChildren(milestone, index) {
  const features = [...(index.featuresByMilestone.get(milestone.number) || [])].sort((a, b) => a.number - b.number);
  const seen = new Set();
  let html = "";
  if (features.length === 0) {
    html += `<p class="govuk-body">No features are assigned to this milestone.</p>`;
  }
  for (const feature of features) {
    const epics = [...(index.epicsByFeature.get(feature.number) || [])]
      .filter((epic) => epic.milestone === milestone.number)
      .sort((a, b) => a.number - b.number);
    epics.forEach((epic) => seen.add(epic.number));
    html += `<h4 class="govuk-heading-s">${issueLink(feature.url, feature.title)} ${priorityTag(feature.labels)} ${stateTag(feature.state)}</h4>`;
    html += epics.length
      ? `<ul class="govuk-list">${epics.map((epic) => renderEpicBlock(epic, index)).join("")}</ul>`
      : `<p class="govuk-body">No epics under this feature for this milestone.</p>`;
  }
  const extra = [...(index.epicsByMilestone.get(milestone.number) || [])].filter((epic) => !seen.has(epic.number));
  if (extra.length) {
    html += `<h4 class="govuk-heading-s">Other epics on this milestone</h4><ul class="govuk-list">${extra.map((epic) => renderEpicBlock(epic, index)).join("")}</ul>`;
  }
  return html;
}

function details(label, title, body) {
  return `<details class="govuk-details"><summary class="govuk-details__summary"><span class="govuk-details__summary-text">${escapeHtml(label)}<span class="govuk-visually-hidden"> for ${escapeHtml(title)}</span></span></summary><div class="govuk-details__text">${body}</div></details>`;
}

function milestoneCard(entry, model, issueBaseUrl) {
  const milestone = entry.item;
  const index = model.index;
  const range = sprintRangeLabel(entry.stories);
  const due = milestone.dueOn ? formatLongDate(milestone.dueOn) : "No due date";
  const scope = [
    plural(index.featuresByMilestone.get(milestone.number)?.length || 0, "feature"),
    plural(index.epicsByMilestone.get(milestone.number)?.length || 0, "epic"),
    plural(entry.stories.length, "story"),
  ].join(", ");
  const excerpt = plainExcerpt(milestone.description);
  const body = `
    <h4 class="govuk-heading-s">Description</h4>
    ${descriptionHtml(milestone.description, issueBaseUrl)}
    <h4 class="govuk-heading-s">Features, epics and stories</h4>
    ${renderMilestoneChildren(milestone, index)}
  `;
  return `<article class="govuk-summary-card roadmap-card">
    <div class="govuk-summary-card__title-wrapper">
      <h3 class="govuk-summary-card__title">${githubTitleLink(milestone.url, milestone.title, "roadmap-card__title-link")}</h3>
    </div>
    <div class="govuk-summary-card__content">
      <p class="roadmap-card__tags">${statusTag(entry.classification.status)} ${stateTag(milestone.state)} ${tag(range.text, range.modifier)}</p>
      ${excerpt ? `<p class="govuk-body">${escapeHtml(excerpt)}</p>` : ""}
      ${summaryList([
        ["Due", escapeHtml(due)],
        ["Earliest sprint", escapeHtml(entry.classification.earliestSprint ? `Sprint ${entry.classification.earliestSprint}` : "Unscheduled")],
        ["Scope", escapeHtml(scope)],
      ])}
      ${details("Show description and child items", milestone.title, body)}
    </div>
  </article>`;
}

function epicCard(entry, model, issueBaseUrl) {
  const epic = entry.item;
  const feature = model.index.features.get(epic.feature);
  const milestone = model.index.milestones.get(epic.milestone);
  const range = sprintRangeLabel(entry.stories);
  const excerpt = plainExcerpt(epic.body);
  const featureHtml = feature ? issueLink(feature.url, feature.title) : "Not linked";
  const milestoneHtml = milestone ? issueLink(milestone.url, milestone.title) : "Not linked";
  const body = `
    <h4 class="govuk-heading-s">Description</h4>
    ${descriptionHtml(epic.body, issueBaseUrl)}
    <h4 class="govuk-heading-s">Stories</h4>
    ${storyItems(entry.stories)}
  `;
  return `<article class="govuk-summary-card roadmap-card">
    <div class="govuk-summary-card__title-wrapper">
      <h3 class="govuk-summary-card__title">${githubTitleLink(epic.url, epic.title, "roadmap-card__title-link")}</h3>
    </div>
    <div class="govuk-summary-card__content">
      <p class="roadmap-card__tags">${statusTag(entry.classification.status)} ${stateTag(epic.state)} ${tag(range.text, range.modifier)}</p>
      ${excerpt ? `<p class="govuk-body">${escapeHtml(excerpt)}</p>` : ""}
      ${summaryList([
        ["Feature", featureHtml],
        ["Milestone", milestoneHtml],
        ["Stories", escapeHtml(plural(entry.stories.length, "story"))],
      ])}
      ${details("Show description and child items", epic.title, body)}
    </div>
  </article>`;
}

function renderBoard(columns, cardRenderer) {
  const total = COLUMNS.reduce((sum, column) => sum + columns[column.id].length, 0);
  if (total === 0) return `<p class="govuk-body">Nothing matches these filters.</p>`;
  return `<div class="app-board">${COLUMNS.map((column) => {
    const entries = columns[column.id];
    return `<section class="app-column app-column--${column.id}" aria-labelledby="column-${column.id}">
      <h2 class="govuk-heading-m" id="column-${column.id}">${column.title} <span class="app-count">(${entries.length})</span></h2>
      <p class="govuk-body-s">${column.hint}</p>
      ${entries.length ? entries.map(cardRenderer).join("") : `<p class="govuk-body">No items.</p>`}
    </section>`;
  }).join("")}</div>`;
}

function renderStory(story, issueBaseUrl) {
  const label = story.sprint ? `Sprint ${story.sprint}` : "Unscheduled";
  const modifier = story.sprint ? "" : "orange";
  const when = story.sprintStart
    ? `${formatLongDate(story.sprintStart)} to ${formatLongDate(story.sprintEnd)}`
    : "No sprint date";
  const body = descriptionHtml(story.body, issueBaseUrl);
  return `<article class="story-card">
    <h4 class="story-card__title">${githubTitleLink(story.url, story.title)}</h4>
    <p class="roadmap-card__tags">${tag(label, modifier)} ${stateTag(story.state)}</p>
    <p class="govuk-body-s">${escapeHtml(when)}</p>
    ${details("Show description", story.title, body)}
  </article>`;
}

function sprintLines(numbers, sprints) {
  return numbers
    .filter((number) => Number.isInteger(number))
    .map((number) => {
      const sprint = sprints.find((item) => item.number === number);
      if (!sprint) return escapeHtml(`Sprint ${number}`);
      return escapeHtml(`Sprint ${number} (${formatLongDate(sprint.start)} to ${formatLongDate(sprint.end)})`);
    })
    .join("<br>");
}

function monthStartsOpen(month, model) {
  if (month.key && String(model.today).slice(0, 7) === month.key) return true;
  const current = model.currentSprint?.number;
  return Number.isInteger(current) && month.sprintNumbers.includes(current);
}

function renderEpicGroup(group, issueBaseUrl) {
  const feature = group.feature ? escapeHtml(group.feature.title) : "No feature";
  const title = group.epic
    ? githubTitleLink(group.epic.url, group.epic.title, "epic-group__title-link")
    : "No epic";
  return `<section class="epic-group">
    <h3 class="govuk-heading-s">${title}</h3>
    <p class="govuk-body-s">${feature}</p>
    ${group.stories.map((story) => renderStory(story, issueBaseUrl)).join("")}
  </section>`;
}

function epicGroupsFromStories(stories, index) {
  const epicIds = [...new Set(stories.map((story) => story.epic ?? 0))].sort((a, b) => a - b);
  return epicIds.map((epicId) => ({
    epic: index.epics.get(epicId) || null,
    feature: index.features.get(index.epics.get(epicId)?.feature) || null,
    stories: stories.filter((story) => (story.epic ?? 0) === epicId).sort((a, b) => a.number - b.number),
  }));
}

function monthSection({ id, heading, summaryHtml, open, modifier = "", body }) {
  const classes = ["govuk-details", "app-month", modifier].filter(Boolean).join(" ");
  return `<details class="${classes}"${open ? " open" : ""}>
    <summary class="govuk-details__summary">
      <span class="govuk-details__summary-text">
        <h2 class="govuk-heading-m app-month__heading" id="${escapeHtml(id)}">${escapeHtml(heading)}</h2>
        <p class="govuk-body-s app-month__sprints">${summaryHtml}</p>
      </span>
    </summary>
    <div class="govuk-details__text">
      <div class="app-epic-grid">${body}</div>
    </div>
  </details>`;
}

function renderStories(model, roadmap) {
  const issueBaseUrl = `${roadmap.source.repoUrl}/issues`;
  const sprints = roadmap.sprints || [];
  if (model.monthGroups.length === 0 && model.unscheduledStories.length === 0) {
    return `<p class="govuk-body">Nothing matches these filters.</p>`;
  }
  const months = model.monthGroups
    .map((month) => monthSection({
      id: `month-${month.key}`,
      heading: month.label,
      summaryHtml: sprintLines(month.sprintNumbers, sprints),
      open: monthStartsOpen(month, model),
      body: month.epics.map((group) => renderEpicGroup(group, issueBaseUrl)).join(""),
    }))
    .join("");
  const unscheduled = model.unscheduledStories.length
    ? monthSection({
      id: "month-unscheduled",
      heading: "Unscheduled",
      summaryHtml: "These stories have no sprint.",
      open: false,
      modifier: "app-month--unscheduled",
      body: epicGroupsFromStories(model.unscheduledStories, model.index)
        .map((group) => renderEpicGroup(group, issueBaseUrl))
        .join(""),
    })
    : "";
  return `<div class="app-months">${months}${unscheduled}</div>`;
}

export function viewCopy(view, counts) {
  if (view === "epics") {
    return {
      heading: "Epics",
      intro: `Epics are issues labelled epic. Each card shows its parent feature and milestone, and is placed from the earliest sprint of its stories. ${plural(counts.epics, "epic")}.`,
    };
  }
  if (view === "stories") {
    return {
      heading: "Stories",
      intro: `Stories are grouped by the month their sprint starts, then by epic. A sprint that crosses two months is shown in the month it starts. The current month, and any month that includes the current sprint, starts open. ${plural(counts.stories, "story")}.`,
    };
  }
  return {
    heading: "Milestones",
    intro: `Milestones are the outcomes. Each one is placed from the earliest sprint of its stories. ${plural(counts.milestones, "milestone")}.`,
  };
}

export function renderAsOf(model, { override = false, dateError = "" } = {}) {
  const sprint = model.currentSprint;
  let extra = "";
  if (model.beforeFirst) {
    extra = ` ${escapeHtml(sprint.title)} has not started yet, so it is treated as the current sprint.`;
  } else if (model.afterLast) {
    extra = ` This date is after the last sprint, so ${escapeHtml(sprint.title)} is treated as the current sprint.`;
  }
  const demo = override ? " Showing a demo date." : "";
  const error = dateError
    ? `<p class="govuk-error-message"><span class="govuk-visually-hidden">Error:</span> ${escapeHtml(dateError)}</p>`
    : "";
  return `<div class="govuk-inset-text"><p class="govuk-body">As of <strong>${escapeHtml(formatLongDate(model.today))}</strong>. Current sprint is <strong>${escapeHtml(sprint.title)}</strong> (${escapeHtml(formatLongDate(sprint.start))} to ${escapeHtml(formatLongDate(sprint.end))}).${extra}${demo}</p>${error}</div>`;
}

export function renderResults(model, view, roadmap) {
  const issueBaseUrl = `${roadmap.source.repoUrl}/issues`;
  if (view === "stories") return renderStories(model, roadmap);
  if (view === "epics") return renderBoard(model.epicColumns, (entry) => epicCard(entry, model, issueBaseUrl));
  return renderBoard(model.milestoneColumns, (entry) => milestoneCard(entry, model, issueBaseUrl));
}

export function snapshotMeta(roadmap, mode) {
  const when = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(roadmap.generatedAt));
  const assignments = roadmap.source.sprintAssignments === "github_project"
    ? "GitHub project iterations"
    : "the committed sprint plan";
  const showing = mode === "live" ? "Showing live data from GitHub." : "Showing the committed snapshot.";
  return `${showing} Generated ${when} UTC. Sprint assignments come from ${assignments}. Repository: ${roadmap.source.repoUrl}. Project: ${roadmap.source.projectUrl}.`;
}
