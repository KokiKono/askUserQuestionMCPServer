import http from "node:http";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import type { Answer, Question } from "./schemas.js";

const OTHER_VALUE = "__other__";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderPage(questions: Question[]): string {
  const blocks = questions
    .map((q, qi) => {
      const desc = q.description
        ? `<p class="desc">${escapeHtml(q.description).replace(/\n/g, "<br>")}</p>`
        : "";
      let body: string;
      if (q.options.length === 0) {
        body = `<textarea name="q${qi}_text" rows="3" placeholder="回答を入力してください"></textarea>`;
      } else {
        const type = q.multiSelect ? "checkbox" : "radio";
        const opts = q.options
          .map((o, oi) => {
            const textInput = o.textInput
              ? `
            <input type="text" name="q${qi}_opt${oi}_text" class="inline-text"
              placeholder="${escapeHtml(o.textInput.placeholder ?? "自由記述")}"${o.textInput.required ? ' data-required="1"' : ""}>`
              : "";
            return `
          <label class="opt">
            <input type="${type}" name="q${qi}" value="${oi}">
            <span class="opt-label">${escapeHtml(o.label)}</span>
            ${o.description ? `<span class="opt-desc">${escapeHtml(o.description)}</span>` : ""}${textInput}
          </label>`;
          })
          .join("");
        body = `${opts}
          <label class="opt">
            <input type="${type}" name="q${qi}" value="${OTHER_VALUE}">
            <span class="opt-label">その他</span>
            <input type="text" name="q${qi}_other" class="inline-text" placeholder="自由記述">
          </label>`;
      }
      return `<fieldset>
        <legend>${qi + 1}. ${escapeHtml(q.question)}${q.multiSelect ? ' <span class="multi">(複数選択可)</span>' : ""}</legend>
        ${desc}
        ${body}
      </fieldset>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>質問への回答</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, "Hiragino Sans", sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
  fieldset { border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 8px; margin-bottom: 1.5rem; padding: 1rem; }
  legend { font-weight: 700; padding: 0 .5rem; }
  .multi { font-weight: 400; font-size: .85em; opacity: .7; }
  .desc { margin: 0 0 .75rem; opacity: .8; white-space: pre-wrap; }
  .opt { display: block; padding: .4rem .5rem; border-radius: 6px; cursor: pointer; }
  .opt:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
  .opt-label { font-weight: 600; margin-left: .25rem; }
  .opt-desc { display: block; margin-left: 1.7rem; font-size: .9em; opacity: .75; }
  .inline-text { display: block; margin: .25rem 0 0 1.7rem; width: 60%; }
  .inline-text.missing { border-color: #e5484d; outline: 1px solid #e5484d; }
  textarea, input[type="text"] { font: inherit; padding: .3rem .5rem; border-radius: 6px; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); background: transparent; color: inherit; }
  textarea { width: 100%; box-sizing: border-box; }
  button { font: inherit; font-weight: 700; padding: .6rem 2rem; border-radius: 8px; border: none; background: #4f6ef7; color: #fff; cursor: pointer; }
  button:hover { background: #3d5ae0; }
</style>
</head>
<body>
<h1>質問への回答 (${questions.length}問)</h1>
<form method="POST" action="/submit">
${blocks}
<button type="button" id="submit-btn">回答を送信</button>
</form>
<script>
  // Focusing an inline text field checks its radio/checkbox automatically
  document.querySelectorAll('.inline-text').forEach(t => {
    t.addEventListener('focus', () => {
      const input = t.closest('label').querySelector('input[type=radio],input[type=checkbox]');
      if (input) input.checked = true;
    });
  });
  const form = document.querySelector('form');
  // Enter must never submit: confirming an IME conversion (Japanese input)
  // fires a keydown that would otherwise trigger implicit form submission.
  // Only the send button submits.
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
  });
  // Block submission while a selected option's required text is empty
  function validate() {
    let firstMissing = null;
    document.querySelectorAll('.inline-text[data-required]').forEach(t => {
      const checked = t.closest('label').querySelector('input[type=radio],input[type=checkbox]').checked;
      const missing = checked && !t.value.trim();
      t.classList.toggle('missing', missing);
      if (missing && !firstMissing) firstMissing = t;
    });
    if (firstMissing) {
      firstMissing.focus();
      return false;
    }
    return true;
  }
  // form.submit() skips the submit event, so validation lives in the click handler
  document.getElementById('submit-btn').addEventListener('click', () => {
    if (validate()) form.submit();
  });
  form.addEventListener('submit', e => {
    if (!validate()) e.preventDefault();
  });
</script>
</body>
</html>`;
}

/** Decode a submitted form body into one Answer per question. */
export function decodeAnswers(
  questions: Question[],
  params: URLSearchParams
): Answer[] {
  return questions.map((q, qi) => {
    if (q.options.length === 0) {
      const text = (params.get(`q${qi}_text`) ?? "").trim();
      return { question: q.question, answers: text ? [text] : [] };
    }
    const selected = params.getAll(`q${qi}`);
    const labels = selected
      .filter((v) => v !== OTHER_VALUE)
      .map((v) => q.options[Number(v)]?.label)
      .filter((v): v is string => Boolean(v));
    const answer: Answer = { question: q.question, answers: labels };
    const optionTexts: Record<string, string> = {};
    for (const v of selected) {
      const oi = Number(v);
      const opt = q.options[oi];
      if (!opt?.textInput) continue;
      const text = (params.get(`q${qi}_opt${oi}_text`) ?? "").trim();
      if (text) optionTexts[opt.label] = text;
    }
    if (Object.keys(optionTexts).length > 0) answer.optionTexts = optionTexts;
    if (selected.includes(OTHER_VALUE)) {
      const other = (params.get(`q${qi}_other`) ?? "").trim();
      answer.other = other || "(その他: 記述なし)";
    }
    return answer;
  });
}

function openBrowser(url: string): void {
  if (process.env.ASK_USER_QUESTION_NO_OPEN) return;
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // Best effort; the URL is also included in server logs
  }
}

/**
 * Serve the answer form on localhost, open the browser, and resolve
 * once the user submits (or reject on timeout).
 */
export function collectAnswers(
  questions: Question[],
  timeoutMs: number
): Promise<Answer[]> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderPage(questions));
        return;
      }
      if (req.method === "POST" && req.url === "/submit") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          const answers = decodeAnswers(questions, new URLSearchParams(body));
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            `<!doctype html><html lang="ja"><meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;margin-top:4rem"><h1>回答を送信しました</h1><p>このタブは閉じて構いません。</p></body></html>`
          );
          clearTimeout(timer);
          server.close();
          resolve(answers);
        });
        return;
      }
      res.writeHead(404);
      res.end("Not Found");
    });

    const timer = setTimeout(() => {
      server.close();
      reject(
        new Error(
          `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for the user to answer.`
        )
      );
    }, timeoutMs);

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      const url = `http://127.0.0.1:${port}/`;
      console.error(`[ask-user-question] Answer form: ${url}`);
      openBrowser(url);
    });
  });
}
