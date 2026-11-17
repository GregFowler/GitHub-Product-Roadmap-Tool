import { addDays } from "./dates.js";

export function buildSprints({ count, lengthDays, firstStart, titlePrefix = "Sprint" }) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Sprint count must be a positive integer");
  }
  if (!Number.isInteger(lengthDays) || lengthDays < 1) {
    throw new Error("Sprint length must be a positive integer");
  }
  const sprints = [];
  for (let number = 1; number <= count; number += 1) {
    const start = addDays(firstStart, lengthDays * (number - 1));
    const end = addDays(start, lengthDays - 1);
    sprints.push({
      number,
      title: `${titlePrefix} ${number}`,
      start,
      end,
    });
  }
  return sprints;
}

export function sprintNumberFromTitle(title) {
  const match = /^Sprint\s+(\d+)$/i.exec(String(title || "").trim());
  if (!match) return null;
  return Number(match[1]);
}

/**
 * Prefer iteration dates from the GitHub project when they differ from the
 * configured calendar. Unknown iteration titles are ignored.
 */
export function mergeSprintCalendar(configured, projectIterations) {
  const byNumber = new Map(configured.map((sprint) => [sprint.number, { ...sprint }]));
  let adjusted = false;
  for (const iteration of projectIterations || []) {
    const number = sprintNumberFromTitle(iteration.title);
    if (!number || !byNumber.has(number)) continue;
    const start = iteration.startDate;
    const duration = iteration.duration;
    if (!start || !Number.isInteger(duration)) continue;
    const end = addDays(start, duration - 1);
    const current = byNumber.get(number);
    if (current.start !== start || current.end !== end) adjusted = true;
    byNumber.set(number, {
      number,
      title: iteration.title,
      start,
      end,
    });
  }
  return {
    sprints: [...byNumber.values()].sort((a, b) => a.number - b.number),
    adjusted,
  };
}
