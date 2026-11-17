import { localISODate, parseISODate } from "./dates.js";

export function parseView(value) {
  return value === "epics" || value === "stories" ? value : "milestones";
}

export function resolveToday(dateParam, today = localISODate()) {
  if (!dateParam) return { today, override: false, error: "" };
  try {
    parseISODate(dateParam);
    return { today: dateParam, override: true, error: "" };
  } catch {
    return {
      today,
      override: false,
      error: "The date in the address is not valid. Showing today.",
    };
  }
}
