export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInline(raw, issueBaseUrl) {
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))|(#\d+)/g;
  let html = "";
  let last = 0;
  for (const match of String(raw).matchAll(pattern)) {
    html += escapeHtml(raw.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      html += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    } else if (token.startsWith("**")) {
      html += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    } else if (token.startsWith("[")) {
      const parts = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = parts?.[2]?.trim() ?? "";
      if (/^https?:\/\//i.test(href)) {
        html += `<a class="govuk-link" href="${escapeHtml(href)}">${escapeHtml(parts[1])}</a>`;
      } else {
        html += escapeHtml(token);
      }
    } else if (token.startsWith("#") && issueBaseUrl) {
      const number = token.slice(1);
      html += `<a class="govuk-link" href="${escapeHtml(`${issueBaseUrl}/${number}`)}">${escapeHtml(token)}</a>`;
    } else {
      html += escapeHtml(token);
    }
    last = match.index + token.length;
  }
  html += escapeHtml(raw.slice(last));
  return html;
}

/**
 * Render a small, escape-first subset of GitHub markdown.
 * Raw HTML in the source is escaped, so it cannot run as markup.
 */
export function renderMarkdown(source, { issueBaseUrl } = {}) {
  const lines = String(source ?? "").replaceAll("\r\n", "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push(`<p class="govuk-body">${renderInline(paragraph.join(" "), issueBaseUrl)}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    blocks.push(`<ul class="govuk-list govuk-list--bullet">${list.items.join("")}</ul>`);
    list = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = /^(#{2,4})\s+(.*)$/.exec(trimmed);
    const task = /^- \[([ xX])\]\s+(.*)$/.exec(trimmed);
    const bullet = /^- +\s*(.*)$/.exec(trimmed);

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(
        `<h4 class="govuk-heading-s">${renderInline(heading[2], issueBaseUrl)}</h4>`,
      );
      continue;
    }

    if (task) {
      flushParagraph();
      if (!list || !list.task) {
        flushList();
        list = { task: true, items: [] };
      }
      const done = task[1].toLowerCase() === "x";
      const hidden = done ? "Completed: " : "Not completed: ";
      const mark = done ? "☑" : "☐";
      list.items.push(
        `<li><span class="govuk-visually-hidden">${hidden}</span><span aria-hidden="true">${mark} </span>${renderInline(task[2], issueBaseUrl)}</li>`,
      );
      continue;
    }

    if (bullet && bullet[1]) {
      flushParagraph();
      if (!list || list.task) {
        flushList();
        list = { task: false, items: [] };
      }
      list.items.push(`<li>${renderInline(bullet[1], issueBaseUrl)}</li>`);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks.join("\n");
}

export function plainExcerpt(markdown, max = 180) {
  const text = String(markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
