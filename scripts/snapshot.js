import { readFile, writeFile } from "node:fs/promises";
import { roadmapConfig } from "../js/config.js";
import { fetchRoadmapFromGitHub } from "../js/github.js";

const planUrl = new URL("./sprint_plan.json", import.meta.url);
const outUrl = new URL("../data/roadmap.json", import.meta.url);
const sprintPlan = JSON.parse(await readFile(planUrl, "utf8"));
const token = process.env.ROADMAP_TOKEN || process.env.GITHUB_TOKEN || "";

if (!token) {
  console.warn("No ROADMAP_TOKEN or GITHUB_TOKEN. Using the public REST API and scripts/sprint_plan.json for sprint assignments.");
}

const roadmap = await fetchRoadmapFromGitHub({
  config: roadmapConfig,
  token,
  sprintPlan,
});

let previous = null;
try {
  previous = JSON.parse(await readFile(outUrl, "utf8"));
} catch {
  previous = null;
}

if (previous) {
  const { generatedAt: _previousGeneratedAt, ...previousBody } = previous;
  const { generatedAt: _nextGeneratedAt, ...nextBody } = roadmap;
  if (JSON.stringify(previousBody) === JSON.stringify(nextBody)) {
    console.log("Snapshot content unchanged.");
    process.exit(0);
  }
}

await writeFile(outUrl, `${JSON.stringify(roadmap, null, 2)}\n`);
console.log(`Wrote data/roadmap.json`);
console.log(
  `milestones=${roadmap.milestones.length} features=${roadmap.features.length} epics=${roadmap.epics.length} stories=${roadmap.stories.length} sprintAssignments=${roadmap.source.sprintAssignments}`,
);
