/**
 * Point the roadmap at another repository by editing this object,
 * then re-run `node scripts/snapshot.js`.
 * projectOwnerType is "user" or "organization".
 */
export const roadmapConfig = {
  owner: "GregFowler",
  repo: "Demo-Product-Map-Repo",
  projectLogin: "GregFowler",
  projectOwnerType: "user",
  projectNumber: 2,
  projectUrl: "https://github.com/users/GregFowler/projects/2",
  projectTitle: "Demo Product Roadmap",
  iterationFieldName: "Sprint",
  labels: {
    feature: "feature",
    epic: "epic",
    story: "story",
  },
  sprints: {
    count: 26,
    lengthDays: 14,
    firstStart: "2026-11-23",
    titlePrefix: "Sprint",
  },
  snapshotUrl: "data/roadmap.json",
};

/** Page title and service name. It follows the configured source repository. */
export function roadmapServiceName(config = roadmapConfig) {
  return `Product roadmap for ${config.repo}`;
}
