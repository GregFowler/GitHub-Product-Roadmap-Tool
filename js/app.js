import { roadmapConfig, roadmapServiceName } from "./config.js";
import { loadSnapshot } from "./data.js";
import { escapeHtml } from "./markdown.js";
import { parseView, resolveToday, showsMilestoneFilter } from "./query.js";
import { currentSprintText, renderAsOf, renderResults, viewCopy } from "./render.js";
import { buildViewModel } from "./view-model.js";

const state = {
  roadmap: null,
  view: "milestones",
  date: "",
  milestone: "",
};

function readFromUrl() {
  const params = new URLSearchParams(location.search);
  state.view = parseView(params.get("view"));
  state.date = params.get("date") || "";
  state.milestone = params.get("milestone") || "";
}

function applySearchParams(params, view) {
  if (view === "milestones") params.delete("view");
  else params.set("view", view);
  if (state.date) params.set("date", state.date);
  else params.delete("date");
  if (state.milestone && showsMilestoneFilter(view)) params.set("milestone", state.milestone);
  else params.delete("milestone");
  params.delete("q");
}

function writeUrl(push) {
  const url = new URL(location.href);
  applySearchParams(url.searchParams, state.view);
  url.search = url.searchParams.toString();
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

function viewHref(view) {
  const url = new URL(location.href);
  applySearchParams(url.searchParams, view);
  url.search = url.searchParams.toString();
  return `${url.pathname}${url.search}`;
}

function applyServiceName() {
  const name = roadmapServiceName(roadmapConfig);
  document.getElementById("service-name").textContent = name;
  document.title = name;
  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.content = `Milestones, epics and stories for ${roadmapConfig.repo}, grouped into Now, Next and Later.`;
  }
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
  document.getElementById("filters").hidden = !showsMilestoneFilter(state.view);
  const milestone = document.getElementById("milestone-filter");
  if (document.activeElement !== milestone) milestone.value = state.milestone;
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
  document.getElementById("view-heading-text").textContent = viewCopy(state.view, {}).heading;
  document.getElementById("view-intro").textContent = "";
  document.getElementById("results").innerHTML = `<div class="govuk-error-summary" role="alert" aria-labelledby="error-summary-title"><h2 class="govuk-error-summary__title" id="error-summary-title">There is a problem</h2><div class="govuk-error-summary__body"><p class="govuk-body">${escapeHtml(message)}</p></div></div>`;
}

function renderDynamic({ focusHeading = false } = {}) {
  const resolved = resolveToday(state.date);
  const model = buildViewModel(state.roadmap, {
    today: resolved.today,
    milestone: showsMilestoneFilter(state.view) ? state.milestone : "",
  });
  const copy = viewCopy(state.view, model.counts);
  const heading = document.getElementById("view-heading");
  document.getElementById("view-heading-text").textContent = copy.heading;
  document.title = roadmapServiceName(roadmapConfig);
  document.getElementById("view-intro").textContent = copy.intro;
  document.getElementById("as-of").innerHTML = renderAsOf(model, {
    dateError: resolved.error,
  });
  document.getElementById("results").innerHTML = renderResults(model, state.view, state.roadmap);
  document.getElementById("app-status").textContent = `${copy.heading}. ${currentSprintText(model.currentSprint)}.`;
  syncNav();
  syncForm();
  if (focusHeading) heading.focus();
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

  document.getElementById("milestone-filter").addEventListener("change", (event) => {
    state.milestone = event.target.value;
    writeUrl(true);
    if (state.roadmap) renderDynamic();
  });

  window.addEventListener("popstate", () => {
    readFromUrl();
    syncForm();
    if (state.roadmap) renderDynamic();
  });
}

async function init() {
  applyServiceName();
  readFromUrl();
  syncNav();
  bind();
  try {
    state.roadmap = await loadSnapshot(roadmapConfig);
  } catch (error) {
    showLoadError(error.message || "The roadmap snapshot could not be loaded.");
    return;
  }
  fillMilestones(state.roadmap);
  syncForm();
  renderDynamic();
}

init();
