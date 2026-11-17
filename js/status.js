import { parseISODate } from "./dates.js";

/**
 * Place an item in Now, Next or Later from the earliest sprint of its stories.
 *
 * Now: the earliest story sprint is the current sprint, the next sprint, or any earlier sprint.
 * Next: the earliest story sprint is current+2 through current+5 (the following 4 sprints).
 * Later: the earliest story sprint is after that.
 * Unscheduled: the item has no story with a sprint. Shown in Later with status "unscheduled".
 *
 * The current sprint is the one whose inclusive start–end range contains `today`.
 * If today is before the first sprint, sprint 1 is current.
 * If today is after the last sprint, the last sprint is current.
 */
export function classifyItem({ today, sprints, earliestSprint }) {
  const currentSprint = currentSprintNumber(today, sprints);
  if (earliestSprint != null && !Number.isInteger(earliestSprint)) {
    throw new Error("earliestSprint must be an integer or null");
  }

  let status;
  let column;
  if (earliestSprint == null) {
    status = "unscheduled";
    column = "later";
  } else if (earliestSprint <= currentSprint + 1) {
    status = "now";
    column = "now";
  } else if (earliestSprint <= currentSprint + 5) {
    status = "next";
    column = "next";
  } else {
    status = "later";
    column = "later";
  }

  return {
    column,
    status,
    currentSprint,
    earliestSprint: earliestSprint ?? null,
  };
}

export function currentSprintNumber(today, sprints) {
  if (!Array.isArray(sprints) || sprints.length === 0) {
    throw new Error("At least one sprint is required");
  }
  parseISODate(today);
  const ordered = [...sprints].sort((a, b) => a.start.localeCompare(b.start) || a.number - b.number);
  if (today < ordered[0].start) return ordered[0].number;
  const last = ordered[ordered.length - 1];
  if (today > last.end) return last.number;
  const containing = ordered.find((sprint) => today >= sprint.start && today <= sprint.end);
  if (containing) return containing.number;
  const upcoming = ordered.find((sprint) => sprint.start > today);
  return upcoming ? upcoming.number : last.number;
}

export function earliestScheduledSprint(stories) {
  let earliest = null;
  for (const story of stories || []) {
    const sprint = story?.sprint;
    if (!Number.isInteger(sprint)) continue;
    if (earliest === null || sprint < earliest) earliest = sprint;
  }
  return earliest;
}
