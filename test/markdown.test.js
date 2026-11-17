import assert from "node:assert/strict";
import test from "node:test";
import { plainExcerpt, renderMarkdown } from "../js/markdown.js";

const issueBaseUrl = "https://github.com/GregFowler/Demo-Product-Map-Repo/issues";

test("escapes raw HTML", () => {
  const html = renderMarkdown("Hello <script>alert(1)</script>\n\n## <img src=x onerror=alert(1)>", {
    issueBaseUrl,
  });
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("<img"), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<h4 class="govuk-heading-s">&lt;img src=x onerror=alert\(1\)&gt;<\/h4>/);
});

test("renders headings, task lists and safe links", () => {
  const html = renderMarkdown(
    "## Acceptance criteria\n\n- [ ] Set a threshold\n- [x] Notify the owner\n\nSee #26 and [docs](https://example.com/docs).\n\n[bad](javascript:alert(1))",
    { issueBaseUrl },
  );
  assert.match(html, /<h4 class="govuk-heading-s">Acceptance criteria<\/h4>/);
  assert.match(html, /Not completed:.*Set a threshold/);
  assert.match(html, /Completed:.*Notify the owner/);
  assert.match(html, /href="https:\/\/github.com\/GregFowler\/Demo-Product-Map-Repo\/issues\/26"/);
  assert.match(html, /href="https:\/\/example.com\/docs"/);
  assert.equal(html.includes("javascript:"), true);
  assert.equal(html.includes('href="javascript:'), false);
});

test("plain excerpt strips markdown markers", () => {
  const excerpt = plainExcerpt("## Outcome\n\nAnalysts can find data.");
  assert.equal(excerpt.includes("#"), false);
  assert.match(excerpt, /Outcome Analysts can find data/);
});
