import { roadmapConfig } from "./config.js";
import { loadLive, loadSnapshot } from "./data.js";
import { escapeHtml } from "./markdown.js";
import { formatLongDate } from "./dates.js";
import { parseView, resolveToday } from "./query.js";
import { renderAsOf, renderResults, snapshotMeta, viewCopy } from "./render.js";
import { buildViewModel } from "./view-model.js";

const TOKEN_KEY = "roadmapToken";

const state = {
  roadmap: null,
  view: "milestones",
  date: "",
  milestone: "",
  query: "",
  mode: "snapshot",
};

function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function writeToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Session storage can be blocked. The typed token is still used for this load. */
  }
}

function readFromUrl() {
  const params = new URLSearchParams(location.search);
  state.view = parseView(params.get("view"));
  state.date = params.get("date") || "";
  state.milestone = params.get("milestone") || "";
  state.query = params.get("q") || "";
}

function writeUrl(push) {
  const url = new URL(location.href);
  const params = url.searchParams;
  if (state.view === "milestones") params.delete("view");
  else params.set("view", state.view);
  if (state.date) params.set("date", state.date);
  else params.delete("date");
  if (state.milestone) params.set("milestone", state.milestone);
  else params.delete("milestone");
  if (state.query) params.set("q", state.query);
  else params.delete("q");
  url.search = params.toString();
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

function viewHref(view) {
  const url = new URL(location.href);
  const params = url.searchParams;
  if (view === "milestones") params.delete("view");
  else params.set("view", view);
  if (state.date) params.set("date", state.date);
  else params.delete("date");
  if (state.milestone) params.set("milestone", state.milestone);
  else params.delete("milestone");
  if (state.query) params.set("q", state.query);
  else params.delete("q");
  url.search = params.toString();
  return `${url.pathname}${url.search}`;
}

function syncNav() {
  document.querySelectorAll("#view-nav a[data-view]").forEach((link) => {
    const active = link.dataset.view === state.view;
    link.parentElement.classList.toggle("govuk-service-navigation__item--active", active);
    link.href = viewHref(link.dataset.view);
    if (active) {
      link.setAttribute("aria-current", "page");
      link.innerHTML = `<strong class="govuk-service-navigation__active-fallback">${escapeHtml(link.dataset.label)}</strong>`;
    } else {
      link.removeAttribute("aria-current");
      link.textContent = link.dataset.label;
    }
  });
}

function syncForm() {
  const search = document.getElementById("search");
  const milestone = document.getElementById("milestone-filter");
  const date = document.getElementById("as-of-date");
  if (document.activeElement !== search) search.value = state.query;
  if (document.activeElement !== milestone) milestone.value = state.milestone;
  if (document.activeElement !== date) date.value = state.date;
}

function fillMilestones(roadmap) {
  const select = document.getElementById("milestone-filter");
  const options = [`<option value="">All milestones</option>`];
  for (const milestone of roadmap.milestones) {
    options.push(`<option value="${milestone.number}">${escapeHtml(milestone.title)}</option>`);
  }
  select.innerHTML = options.join("");
}

function showLoadError(message) {
  document.getElementById("view-heading").textContent = "Product roadmap";
  document.getElementById("view-intro").textContent = "";
  document.getElementById("results").innerHTML = `<div class="govuk-error-summary" role="alert" aria-labelledby="error-summary-title"><h2 class="govuk-error-summary__title" id="error-summary-title">There is a problem</h2><div class="govuk-error-summary__body"><p class="govuk-body">${escapeHtml(message)}</p></div></div>`;
}

function renderDynamic({ focusHeading = false } = {}) {
  const resolved = resolveToday(state.date);
  const model = buildViewModel(state.roadmap, {
    today: resolved.today,
    milestone: state.milestone,
    query: state.query,
  });
  const copy = viewCopy(state.view, model.counts);
  const heading = document.getElementById("view-heading");
  heading.textContent = copy.heading;
  document.title = `${copy.heading} - ${roadmapConfig.serviceName}`;
  document.getElementById("view-intro").textContent = copy.intro;
  document.getElementById("as-of").innerHTML = renderAsOf(model, {
    override: resolved.override,
    dateError: resolved.error,
  });
  document.getElementById("results").innerHTML = renderResults(model, state.view, state.roadmap);
  document.getElementById("app-status").textContent = `${copy.heading}. As of ${formatLongDate(resolved.today)}. Current sprint ${model.currentSprint.title}.`;
  document.getElementById("snapshot-meta").textContent = snapshotMeta(state.roadmap, state.mode);
  syncNav();
  if (focusHeading) heading.focus();
}

function setLiveStatus(message) {
  document.getElementById("live-status").textContent = message;
}

function bind() {
  document.getElementById("view-nav").addEventListener("click", (event) => {
    const link = event.target.closest("a[data-view]");
    if (!link) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (!state.roadmap) return;
    state.view = link.dataset.view;
    writeUrl(true);
    renderDynamic({ focusHeading: true });
  });

  document.getElementById("search").addEventListener("input", (event) => {
    state.query = event.target.value;
    writeUrl(false);
    if (state.roadmap) renderDynamic();
  });

  document.getElementById("milestone-filter").addEventListener("change", (event) => {
    state.milestone = event.target.value;
    writeUrl(true);
    if (state.roadmap) renderDynamic();
  });

  document.getElementById("date-form").addEventListener("submit", (event) => {
    event.preventDefault();
    state.date = document.getElementById("as-of-date").value;
    writeUrl(true);
    if (state.roadmap) renderDynamic();
  });

  document.getElementById("reset-date").addEventListener("click", (event) => {
    event.preventDefault();
    state.date = "";
    document.getElementById("as-of-date").value = "";
    writeUrl(true);
    if (state.roadmap) renderDynamic();
  });

  document.getElementById("load-live").addEventListener("click", async () => {
    const input = document.getElementById("github-token");
    const typed = input.value.trim();
    if (typed) writeToken(typed);
    input.value = "";
    const token = typed || readToken();
    if (!token) {
      setLiveStatus("Enter a GitHub token first.");
      return;
    }
    setLiveStatus("Loading live data…");
    try {
      state.roadmap = await loadLive(roadmapConfig, token);
      state.mode = "live";
      document.getElementById("filters").hidden = false;
      fillMilestones(state.roadmap);
      syncForm();
      renderDynamic();
      setLiveStatus("Live data loaded. The token stays in this browser session until you forget it.");
    } catch (error) {
      setLiveStatus(error.message || "Live data could not be loaded. The snapshot is still on screen.");
    }
  });

  document.getElementById("use-snapshot").addEventListener("click", async () => {
    setLiveStatus("Loading the snapshot…");
    try {
      state.roadmap = await loadSnapshot(roadmapConfig);
      state.mode = "snapshot";
      document.getElementById("filters").hidden = false;
      fillMilestones(state.roadmap);
      syncForm();
      renderDynamic();
      setLiveStatus("Showing the committed snapshot.");
    } catch (error) {
      setLiveStatus(error.message || "The snapshot could not be loaded.");
    }
  });

  document.getElementById("forget-token").addEventListener("click", () => {
    writeToken("");
    document.getElementById("github-token").value = "";
    setLiveStatus("Token forgotten. The roadmap on screen is unchanged.");
  });

  window.addEventListener("popstate", () => {
    readFromUrl();
    syncForm();
    if (state.roadmap) renderDynamic();
  });
}

async function init() {
  readFromUrl();
  syncNav();
  bind();
  if (readToken()) setLiveStatus("A token is saved in this browser session.");
  try {
    state.roadmap = await loadSnapshot(roadmapConfig);
  } catch (error) {
    showLoadError(error.message || "The roadmap snapshot could not be loaded.");
    return;
  }
  document.getElementById("filters").hidden = false;
  fillMilestones(state.roadmap);
  syncForm();
  renderDynamic();
}

init();
