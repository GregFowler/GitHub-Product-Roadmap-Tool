import { fetchRoadmapFromGitHub } from "./github.js";

export async function loadSnapshot(config, fetchImpl = globalThis.fetch) {
  const base = globalThis.document?.baseURI;
  const url = base ? new URL(config.snapshotUrl, base) : config.snapshotUrl;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Could not load the roadmap snapshot (${response.status}).`);
  }
  return response.json();
}

export async function loadLive(config, token) {
  if (!token) throw new Error("Enter a GitHub token to load live data.");
  return fetchRoadmapFromGitHub({ config, token, sprintPlan: [] });
}
