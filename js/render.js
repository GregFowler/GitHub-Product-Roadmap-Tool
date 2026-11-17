import { formatDateRange, formatLongDate, formatShortDateRange } from "./dates.js";
import { escapeHtml, plainExcerpt, renderMarkdown } from "./markdown.js";
import { barPlacement, cssPercent, timelineScale } from "./timeline.js";

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
        ? ` <span class="govuk-body-s">(${escapeHtml(formatDateRange(story.sprintStart, story.sprintEnd))})</span>`
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

function milestoneDetail(entry, model, issueBaseUrl) {
  const milestone = entry.item;
  const index = model.index;
  const due = milestone.dueOn ? formatLongDate(milestone.dueOn) : "No due date";
  const scope = [
    plural(index.featuresByMilestone.get(milestone.number)?.length || 0, "feature"),
    plural(index.epicsByMilestone.get(milestone.number)?.length || 0, "epic"),
    plural(entry.stories.length, "story"),
  ].join(", ");
  const body = `
    ${summaryList([
      ["Due", escapeHtml(due)],
      ["Earliest sprint", escapeHtml(entry.classification.earliestSprint ? `Sprint ${entry.classification.earliestSprint}` : "Unscheduled")],
      ["Scope", escapeHtml(scope)],
    ])}
    <h3 class="govuk-heading-s">Description</h3>
    ${descriptionHtml(milestone.description, issueBaseUrl)}
    <h3 class="govuk-heading-s">Features, epics and stories</h3>
    ${renderMilestoneChildren(milestone, index)}
  `;
  return details("Show description and child items", milestone.title, body);
}

function scaleTicks(items) {
  return items.map((item) => {
    const span = item.span > 1 ? ` style="grid-column: span ${item.span}"` : "";
    return `<span class="app-timeline__tick"${span}>${escapeHtml(item.label)}</span>`;
  }).join("");
}

function laneGrid(months) {
  const cells = months.map((month) => `<span${month.quarterStart ? ' class="is-quarter"' : ""}></span>`).join("");
  return `<div class="app-timeline__grid" aria-hidden="true">${cells}</div>`;
}

function todayMarker(fraction, { flag = false, label = "" } = {}) {
  const left = `clamp(0px, calc(${cssPercent(fraction)} - 1px), calc(100% - 2px))`;
  if (flag) {
    return `<div class="app-timeline__today-flag" style="left: ${left}"><span class="govuk-visually-hidden">${escapeHtml(label)}</span></div>`;
  }
  return `<div class="app-timeline__today" style="left: ${left}" aria-hidden="true"></div>`;
}

function timelineScaleHtml(scale) {
  const months = scale.months.length;
  return `<div class="app-timeline__scale-row">
    <div class="app-timeline__scale" style="--months: ${months}">
      <div class="app-timeline__years">${scaleTicks(scale.years)}</div>
      <div class="app-timeline__months">${scaleTicks(scale.months)}</div>
      <div class="app-timeline__quarters">${scaleTicks(scale.quarters)}</div>
      ${todayMarker(scale.todayFraction, { flag: true, label: `Today, ${formatLongDate(scale.today)}` })}
    </div>
  </div>`;
}

function timelineTrack(entry, scale) {
  const marker = todayMarker(scale.todayFraction);
  const grid = laneGrid(scale.months);
  if (!entry.span) {
    return `<div class="app-timeline__track">
      <div class="app-timeline__lane">${grid}${marker}<p class="app-timeline__unscheduled">Not scheduled</p></div>
    </div>`;
  }
  const placement = barPlacement(entry.span.start, entry.span.end, scale.months);
  const status = STATUS_TEXT[entry.classification.status] || "Later";
  const modifier = entry.classification.status === "now" || entry.classification.status === "next"
    ? entry.classification.status
    : "later";
  const visible = `${status}, ${formatShortDateRange(entry.span.start, entry.span.end)}`;
  const alternative = `${status}, ${formatDateRange(entry.span.start, entry.span.end)}`;
  const from = placement.align === "end"
    ? cssPercent(placement.left + placement.width)
    : cssPercent(placement.left);
  const align = placement.align === "end" ? " app-timeline__dates--end" : "";
  return `<div class="app-timeline__track">
    <div class="app-timeline__lane">
      ${grid}
      ${marker}
      <div class="app-timeline__bar app-timeline__bar--${modifier}" role="img" aria-label="${escapeHtml(alternative)}" style="left: ${cssPercent(placement.left)}; width: ${cssPercent(placement.width)};"></div>
    </div>
    <p class="govuk-body-s app-timeline__dates${align}" style="--from: ${from}" aria-hidden="true">${escapeHtml(visible)}</p>
  </div>`;
}

function timelineItem(entry, model, scale, issueBaseUrl) {
  const milestone = entry.item;
  const closed = stateTag(milestone.state);
  return `<article class="app-timeline__item">
    <div class="app-timeline__label">
      <h2 class="govuk-heading-s app-timeline__title">${githubTitleLink(milestone.url, milestone.title)}</h2>
      ${closed ? `<p class="app-timeline__tags">${closed}</p>` : ""}
    </div>
    ${timelineTrack(entry, scale)}
    <div class="app-timeline__disclosure">${milestoneDetail(entry, model, issueBaseUrl)}</div>
  </article>`;
}

function renderTimeline(model, roadmap) {
  const entries = model.milestones || [];
  if (entries.length === 0) return `<p class="govuk-body">Nothing matches these filters.</p>`;
  const issueBaseUrl = `${roadmap.source.repoUrl}/issues`;
  const scale = timelineScale(entries.map((entry) => entry.span), model.today);
  const legend = `<ul class="app-timeline__legend">
    <li><span class="app-timeline__key app-timeline__key--now" aria-hidden="true"></span> Now</li>
    <li><span class="app-timeline__key app-timeline__key--next" aria-hidden="true"></span> Next</li>
    <li><span class="app-timeline__key app-timeline__key--later" aria-hidden="true"></span> Later</li>
    <li><span class="app-timeline__key app-timeline__key--today" aria-hidden="true"></span> Today</li>
  </ul>`;
  const rows = entries.map((entry) => timelineItem(entry, model, scale, issueBaseUrl)).join("");
  return `<div class="app-timeline" style="--months: ${scale.months.length}">${legend}${timelineScaleHtml(scale)}<div class="app-timeline__rows">${rows}</div></div>`;
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

function sprintLines(numbers, sprints) {
  return numbers
    .filter((number) => Number.isInteger(number))
    .map((number) => {
      const sprint = sprints.find((item) => item.number === number);
      if (!sprint) return escapeHtml(`Sprint ${number}`);
      return escapeHtml(`Sprint ${number} (${formatDateRange(sprint.start, sprint.end)})`);
    })
    .join("<br>");
}

function compareStories(a, b) {
  const sprintA = a.sprint ?? 999;
  const sprintB = b.sprint ?? 999;
  if (sprintA !== sprintB) return sprintA - sprintB;
  const epicA = a.epic ?? 0;
  const epicB = b.epic ?? 0;
  if (epicA !== epicB) return epicA - epicB;
  return a.number - b.number;
}

function linkedName(item) {
  return item ? issueLink(item.url, item.title) : "Not linked";
}

function issueStateTag(state) {
  return state === "closed" ? tag("Closed", "grey") : tag("Open");
}

function sprintCell(story) {
  if (!story.sprint) return tag("Unscheduled", "orange");
  const dates = story.sprintStart && story.sprintEnd
    ? `<span class="app-sprint__dates">${escapeHtml(formatDateRange(story.sprintStart, story.sprintEnd)).replace(/ (\d{4})/g, "\u00a0$1")}</span>`
    : "";
  return `<span class="app-sprint">${tag(`Sprint ${story.sprint}`)}${dates}</span>`;
}

function storyRow(story, index) {
  const epic = index.epics.get(story.epic) || null;
  const milestone = index.milestones.get(story.milestone) || null;
  return `<tr class="govuk-table__row" role="row">
    <th scope="row" role="rowheader" class="govuk-table__header app-stories-table__story" data-label="Story">${issueLink(story.url, story.title)}</th>
    <td role="cell" class="govuk-table__cell app-stories-table__epic" data-label="Epic">${linkedName(epic)}</td>
    <td role="cell" class="govuk-table__cell app-stories-table__milestone" data-label="Milestone">${linkedName(milestone)}</td>
    <td role="cell" class="govuk-table__cell app-stories-table__sprint" data-label="Sprint">${sprintCell(story)}</td>
    <td role="cell" class="govuk-table__cell app-stories-table__status" data-label="Status">${issueStateTag(story.state)}</td>
  </tr>`;
}

function storyTable(stories, index, caption) {
  const rows = stories.slice().sort(compareStories).map((story) => storyRow(story, index)).join("");
  return `<table class="govuk-table app-stories-table" role="table">
    <caption class="govuk-table__caption govuk-visually-hidden">${escapeHtml(caption)}</caption>
    <thead class="govuk-table__head" role="rowgroup">
      <tr class="govuk-table__row" role="row">
        <th scope="col" role="columnheader" class="govuk-table__header app-stories-table__story">Story</th>
        <th scope="col" role="columnheader" class="govuk-table__header app-stories-table__epic">Epic</th>
        <th scope="col" role="columnheader" class="govuk-table__header app-stories-table__milestone">Milestone</th>
        <th scope="col" role="columnheader" class="govuk-table__header app-stories-table__sprint">Sprint</th>
        <th scope="col" role="columnheader" class="govuk-table__header app-stories-table__status">Status</th>
      </tr>
    </thead>
    <tbody class="govuk-table__body" role="rowgroup">${rows}</tbody>
  </table>`;
}

function monthStartsOpen(month, model) {
  if (month.key && String(model.today).slice(0, 7) === month.key) return true;
  const current = model.currentSprint?.number;
  return Number.isInteger(current) && month.sprintNumbers.includes(current);
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
    <div class="govuk-details__text">${body}</div>
  </details>`;
}

function renderStories(model, roadmap) {
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
      body: storyTable(month.epics.flatMap((group) => group.stories), model.index, `Stories in ${month.label}`),
    }))
    .join("");
  const unscheduled = model.unscheduledStories.length
    ? monthSection({
      id: "month-unscheduled",
      heading: "Unscheduled",
      summaryHtml: "These stories have no sprint.",
      open: false,
      modifier: "app-month--unscheduled",
      body: storyTable(model.unscheduledStories, model.index, "Stories with no sprint"),
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
      intro: `Stories are listed by the month their sprint starts. A sprint that crosses two months is shown in the month it starts. The current month, and any month that includes the current sprint, starts open. ${plural(counts.stories, "story")}.`,
    };
  }
  return {
    heading: "Milestones",
    intro: `Milestones are the outcomes. Each bar runs from the start of the earliest story sprint to the end of the latest. ${plural(counts.milestones, "milestone")}.`,
  };
}

export function currentSprintText(sprint) {
  return `Current sprint is ${sprint.title} (${formatDateRange(sprint.start, sprint.end)})`;
}

export function renderAsOf(model, { dateError = "", includeSprint = true } = {}) {
  const error = dateError
    ? `<p class="govuk-error-message"><span class="govuk-visually-hidden">Error:</span> ${escapeHtml(dateError)}</p>`
    : "";
  if (!includeSprint) return error ? `<div class="govuk-inset-text">${error}</div>` : "";
  const sprint = model.currentSprint;
  return `<div class="govuk-inset-text"><p class="govuk-body">Current sprint is <strong>${escapeHtml(sprint.title)}</strong> (${escapeHtml(formatDateRange(sprint.start, sprint.end))}).</p>${error}</div>`;
}

export function renderViewStatus(model, view, options = {}) {
  return renderAsOf(model, { ...options, includeSprint: view !== "milestones" });
}

export function announceView(view, heading, sprint) {
  if (view === "milestones") return `${heading}.`;
  return `${heading}. ${currentSprintText(sprint)}.`;
}

export function renderResults(model, view, roadmap) {
  const issueBaseUrl = `${roadmap.source.repoUrl}/issues`;
  if (view === "stories") return renderStories(model, roadmap);
  if (view === "epics") return renderBoard(model.epicColumns, (entry) => epicCard(entry, model, issueBaseUrl));
  return renderTimeline(model, roadmap);
}
