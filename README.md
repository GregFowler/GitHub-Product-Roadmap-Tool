# Product roadmap

A static prototype that turns GitHub milestones, issues and project iterations into three planning views: **Milestones**, **Epics** and **Stories**.

It is published with GitHub Pages from the root of `main`:

https://gregfowler.github.io/GitHub-Product-Roadmap-Tool/

This is a planning prototype. It is not an official government service, and it does not use the GOV.UK crown.

The sample data is the public repository [GregFowler/Demo-Product-Map-Repo](https://github.com/GregFowler/Demo-Product-Map-Repo) and the public project [Demo Product Roadmap](https://github.com/users/GregFowler/projects/2).

## Views

Use the links in the service header. The address keeps the current filters, for example `?view=epics&date=2027-01-18`.

| View | What it shows |
| --- | --- |
| Milestones | The three outcomes (GitHub milestones), in Now / Next / Later columns |
| Epics | Issues labelled `epic`, in Now / Next / Later columns. Each card shows its parent feature and milestone |
| Stories | Issues labelled `story`, grouped by the calendar month the sprint **starts**, then by epic. Each story shows its sprint |

Open a card with the disclosure (“Show description and child items”). That works with a keyboard, a mouse or a touch screen. The disclosure includes:

- the GitHub description, rendered from a small markdown subset (raw HTML is escaped)
- a link to the milestone or issue
- child features, epics and stories, with each story’s sprint

Search and the milestone filter narrow what is on screen. They do not change how Now / Next / Later is calculated.

## Now, Next and Later

The bands are calculated. Nothing in GitHub is labelled Now, Next or Later.

For each milestone and each epic, find the **earliest sprint in which any of its child stories starts**.

The **current sprint** is the sprint whose date range contains today (start and end are inclusive). Sprint 1 starts on Monday 23 November 2026. Sprint N starts on 23 November 2026 plus 14 × (N − 1) days, and lasts 14 days. There are 26 sprints.

- If today is before Sprint 1, Sprint 1 is treated as current.
- If today is after Sprint 26, Sprint 26 is treated as current.

Then:

| Band | Rule |
| --- | --- |
| Now | The earliest story sprint is the current sprint, the next sprint, or any earlier sprint |
| Next | The earliest story sprint is one of the following four sprints (`current + 2` through `current + 5`) |
| Later | The earliest story sprint is after that |
| Unscheduled | The milestone or epic has no story with a sprint. It is shown in the Later column with an **Unscheduled** tag |

Stories with a sprint still count if some sibling stories are unscheduled. The earliest scheduled sprint wins.

The page shows the date it is using and the current sprint. Add `?date=YYYY-MM-DD` to demo another day, or use **View as of** and **Update date**. Example: [`?date=2027-01-18`](https://gregfowler.github.io/GitHub-Product-Roadmap-Tool/?date=2027-01-18). **Reset to today** clears that override. An invalid date is ignored and today is shown.

On 17 November 2026 (before Sprint 1), Outcome 1 is Now because its stories start in Sprint 1. Outcome 2 is Next because its earliest story is Sprint 3. Outcome 3 is Later because its earliest story is Sprint 7. On 18 January 2027 the current sprint is Sprint 5, so Outcome 2 moves into Now and Outcome 3 moves into Next.

## Data

The page reads `data/roadmap.json`. Loading is separate from rendering (`js/data.js`), so a live source can replace the snapshot without changing the views.

The snapshot includes milestones, features, epics and stories with titles, markdown bodies, URLs, parent links, milestones, and, for stories, the sprint number and iteration dates. It also includes the 26-sprint calendar.

`scripts/snapshot.js` rebuilds it:

```bash
# With a token: issues, parents and the project Sprint field come from GitHub.
ROADMAP_TOKEN=your_token node scripts/snapshot.js

# Without a token: public REST for milestones, issues and sub-issues,
# and scripts/sprint_plan.json for story sprint assignments.
node scripts/snapshot.js
```

`GITHUB_TOKEN` is used when `ROADMAP_TOKEN` is unset. The script does not write a new file when the content is unchanged. Project iteration dates are compared with the configured calendar; this sample matches, so the committed calendar is the configured one (Sprint 1 on 23 November 2026).

Unauthenticated REST is limited to 60 requests an hour per IP. The fallback needs one milestones request, one or more issue-list requests, and one sub-issues request per feature and epic. Project v2 iteration values are not available on the public REST API, even for a public project, which is why the sprint plan file exists.

There is an optional **Load live data with a GitHub token** panel. The token is kept in `sessionStorage` and sent only to `api.github.com`. Leave it closed to stay on the snapshot. Do not paste a token on a computer you do not trust: any script on the page can read it.

## Refresh workflow

`.github/workflows/refresh-snapshot.yml` runs on a Monday schedule, on `workflow_dispatch`, and when an issue in **this** repository is opened, edited, closed, reopened, labelled or milestoned. It cannot see issue events from the source repository. Use the weekly run, or run the workflow by hand, after the source roadmap changes.

If the `ROADMAP_TOKEN` Actions secret is missing, the job logs a message and exits successfully without changing the snapshot.

To enable refresh:

1. Create a personal access token that can read issues in the source repository and read the user or organisation project. A classic token needs `public_repo` (or `repo` for a private source) and `read:project`.
2. In this repository, add an Actions secret named `ROADMAP_TOKEN`.
3. Allow GitHub Actions to update `main` (Settings → Actions → General → Workflow permissions → Read and write). Branch protection that blocks direct pushes will stop the commit step.

## Point it at another repository

Edit the single config object in `js/config.js`:

- `owner` and `repo` — the issue repository
- `projectLogin`, `projectOwnerType` (`user` or `organization`), `projectNumber`, `projectUrl`, `projectTitle`
- `iterationFieldName` — the project iteration field (this sample uses `Sprint`)
- `labels.feature`, `labels.epic`, `labels.story`
- `sprints.count`, `sprints.lengthDays`, `sprints.firstStart` — used when the project does not supply iteration dates, and as the fallback calendar
- `snapshotUrl` — where the page loads the snapshot from

The expected shape is the same as the sample:

- milestones are the outcomes
- issues labelled `feature` sit on a milestone
- issues labelled `epic` are GitHub sub-issues of a feature
- issues labelled `story` are sub-issues of an epic, on the same milestone as that epic
- only stories use the iteration field

Then either export a token and run `node scripts/snapshot.js`, or update `scripts/sprint_plan.json` (an array of `{ issue_number, title, epic, feature, milestone, sprint, sprint_start }`) and run the script without a token. Commit `data/roadmap.json`.

## Run locally

No build step. Node 20 or newer is only needed for the snapshot script and the tests.

```bash
npm test
npm start
```

`npm start` serves the repository root at http://127.0.0.1:8080/. Any static file server works. Paths are relative, so a project-site URL such as `/GitHub-Product-Roadmap-Tool/` works as well as a local server.

## Tests

`npm test` runs `node --test`. The Now / Next / Later rules live in `js/status.js` (`classifyItem`). Sprint dates live in `js/sprints.js`. Parent linking lives in `js/model.js`. The views are built in `js/view-model.js` and rendered in `js/render.js`.

## Accessibility

The page uses the GOV.UK Frontend stylesheet (vendored under `vendor/govuk`, version 6.6.0, MIT) for typography, tags, summary cards, the phase banner, details, buttons and form controls. The service header is the GOV.UK service navigation pattern, with the service name “Product roadmap” and no crown logo.

- Skip link, one `h1`, and headings nested as view → column or month → card or epic → story
- Native `<details>` disclosures, so they work on a keyboard and on touch without a hover
- Status is text in a tag, not colour alone
- Now / Next / Later columns stack below the GOV.UK tablet breakpoint. The story timeline scrolls sideways on a wide screen and becomes a vertical month list on a small screen
- Markdown is escaped before a small set of headings, lists, task lists and `http(s)` links is applied
