export function parseISODate(iso) {
  if (typeof iso !== "string") {
    throw new TypeError("Date must be a YYYY-MM-DD string");
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Invalid date: ${iso}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date: ${iso}`);
  }
  return date;
}

export function formatISODate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(iso, days) {
  const date = parseISODate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatISODate(date);
}

export function localISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const longDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const monthYear = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function formatLongDate(iso) {
  return longDate.format(parseISODate(iso));
}

/** Inclusive range. A repeated year is written once, at the end. */
export function formatDateRange(startIso, endIso) {
  const start = parseISODate(startIso);
  const end = parseISODate(endIso);
  const startText = start.getUTCFullYear() === end.getUTCFullYear()
    ? dayMonth.format(start)
    : longDate.format(start);
  return `${startText} to ${longDate.format(end)}`;
}

export function formatMonthKey(yearMonth) {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) throw new Error(`Invalid month: ${yearMonth}`);
  return monthYear.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

export function dateOnly(value) {
  if (!value) return null;
  const day = String(value).slice(0, 10);
  parseISODate(day);
  return day;
}
