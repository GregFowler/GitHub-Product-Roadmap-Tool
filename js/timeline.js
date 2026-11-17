import { formatMonthShort, parseISODate } from "./dates.js";

/**
 * Span of an item from its child stories.
 * Start is the start date of the earliest sprint number.
 * End is the end date of the latest sprint number.
 * Stories without a sprint are ignored.
 * Returns null when no story has a sprint, or those sprints have no dates.
 */
export function scheduledSpan(stories, sprints) {
  let earliest = null;
  let latest = null;
  for (const story of stories || []) {
    const sprint = story?.sprint;
    if (!Number.isInteger(sprint)) continue;
    if (earliest === null || sprint < earliest) earliest = sprint;
    if (latest === null || sprint > latest) latest = sprint;
  }
  if (earliest === null || latest === null) return null;

  const byNumber = new Map((sprints || []).map((sprint) => [sprint.number, sprint]));
  const start = sprintBound(earliest, "start", stories, byNumber);
  const end = sprintBound(latest, "end", stories, byNumber);
  if (!start || !end || start > end) return null;
  return {
    earliestSprint: earliest,
    latestSprint: latest,
    start,
    end,
  };
}

function sprintBound(number, field, stories, byNumber) {
  const sprint = byNumber.get(number);
  if (sprint?.[field]) return sprint[field];
  const storyField = field === "start" ? "sprintStart" : "sprintEnd";
  const story = (stories || []).find((item) => item?.sprint === number && item[storyField]);
  return story ? story[storyField] : null;
}

/** Inclusive month columns from startIso through endIso. Each month is one equal column. */
export function monthColumns(startIso, endIso) {
  const start = parseISODate(startIso);
  const end = parseISODate(endIso);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth() + 1;
  const endKey = end.getUTCFullYear() * 12 + end.getUTCMonth() + 1;
  const months = [];
  let previous = null;
  while (year * 12 + month <= endKey) {
    const quarter = Math.floor((month - 1) / 3) + 1;
    const quarterStart = !previous || previous.year !== year || previous.quarter !== quarter;
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    months.push({
      key: `${year}-${String(month).padStart(2, "0")}`,
      year,
      month,
      days,
      quarter,
      quarterStart,
      label: formatMonthShort(year, month),
    });
    previous = { year, quarter };
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function yearColumns(months) {
  const groups = [];
  for (const month of months || []) {
    const current = groups[groups.length - 1];
    if (!current || current.year !== month.year) {
      groups.push({ year: month.year, span: 1, label: String(month.year) });
    } else {
      current.span += 1;
    }
  }
  return groups;
}

export function quarterColumns(months) {
  const groups = [];
  for (const month of months || []) {
    const current = groups[groups.length - 1];
    if (!current || current.year !== month.year || current.quarter !== month.quarter) {
      groups.push({ year: month.year, quarter: month.quarter, span: 1, label: "" });
    } else {
      current.span += 1;
    }
  }
  let lastYear = null;
  for (const group of groups) {
    const showYear = group.year !== lastYear;
    lastYear = group.year;
    const year = String(group.year).slice(2);
    group.label = showYear ? `Q${group.quarter} ’${year}` : `Q${group.quarter}`;
  }
  return groups;
}

/**
 * Position of a date along equal-width month columns, from 0 to 1.
 * "start" is the beginning of that day. "end" is the end of that inclusive day.
 * Dates outside the axis clamp to 0 or 1.
 */
export function dateFraction(iso, months, edge = "start") {
  if (!months?.length) return 0;
  const date = parseISODate(iso);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const index = months.findIndex((item) => item.year === year && item.month === month);
  if (index < 0) {
    const first = months[0].year * 12 + months[0].month;
    return year * 12 + month < first ? 0 : 1;
  }
  const within = edge === "end" ? day / months[index].days : (day - 1) / months[index].days;
  return (index + within) / months.length;
}

export function barPlacement(startIso, endIso, months) {
  const left = dateFraction(startIso, months, "start");
  const right = dateFraction(endIso, months, "end");
  const width = Math.max(0, right - left);
  return {
    left,
    width,
    align: left > 0.45 ? "end" : "start",
  };
}

/** Shared axis covering every span, and today, so the marker stays on the chart. */
export function timelineScale(spans, today) {
  parseISODate(today);
  let start = today;
  let end = today;
  for (const span of spans || []) {
    if (!span?.start || !span?.end) continue;
    if (span.start < start) start = span.start;
    if (span.end > end) end = span.end;
  }
  const months = monthColumns(start, end);
  return {
    start,
    end,
    today,
    months,
    years: yearColumns(months),
    quarters: quarterColumns(months),
    todayFraction: dateFraction(today, months, "start"),
  };
}

export function cssPercent(fraction) {
  const clamped = Math.min(1, Math.max(0, fraction));
  return `${(clamped * 100).toFixed(4)}%`;
}
