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

/**
 * Render the question fieldsets and send button for one round.
 * Served on its own so an already-open tab can swap in the next round
 * without a page load.
 */
export function renderForm(questions: Question[], roundId = 1): string {
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
        // A single-select question can only honour the first recommendation.
        let singleTaken = false;
        const opts = q.options
          .map((o, oi) => {
            let checked = "";
            if (o.recommended && (q.multiSelect || !singleTaken)) {
              checked = " checked";
              singleTaken = true;
            }
            const badge = o.recommended ? ' <span class="rec">推奨</span>' : "";
            const textInput = o.textInput
              ? `
            <input type="text" name="q${qi}_opt${oi}_text" class="inline-text"
              placeholder="${escapeHtml(o.textInput.placeholder ?? "自由記述")}"${o.textInput.required ? ' data-required="1"' : ""}>`
              : "";
            return `
          <label class="opt">
            <input type="${type}" name="q${qi}" value="${oi}"${checked}>
            <span class="opt-label">${escapeHtml(o.label)}</span>${badge}
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

  return `<h1>質問への回答 (${questions.length}問)</h1>
<form id="answer-form" data-round="${roundId}">
${blocks}
<button type="button" id="submit-btn">回答を送信</button>
</form>`;
}

const WAITING_HTML = `<div class="waiting">
  <h1>回答を送信しました</h1>
  <p>このタブは開いたままにしてください。次の質問はここに表示されます。</p>
</div>`;

/** The page shell: static across rounds, so only its contents are swapped. */
function renderShell(inner: string): string {
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
  .rec { font-size: .75em; font-weight: 700; padding: .1rem .4rem; border-radius: 999px; background: #4f6ef7; color: #fff; vertical-align: .1em; }
  .inline-text { display: block; margin: .25rem 0 0 1.7rem; width: 60%; }
  .inline-text.missing { border-color: #e5484d; outline: 1px solid #e5484d; }
  textarea, input[type="text"] { font: inherit; padding: .3rem .5rem; border-radius: 6px; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); background: transparent; color: inherit; }
  textarea { width: 100%; box-sizing: border-box; }
  button { font: inherit; font-weight: 700; padding: .6rem 2rem; border-radius: 8px; border: none; background: #4f6ef7; color: #fff; cursor: pointer; }
  button:hover { background: #3d5ae0; }
  button:disabled { opacity: .5; cursor: default; }
  .waiting { text-align: center; margin-top: 4rem; opacity: .85; }
  .error { color: #e5484d; font-weight: 700; }
</style>
</head>
<body>
<main id="host">${inner}</main>
<script>
  const host = document.getElementById('host');

  function showWaiting(extra) {
    host.innerHTML = ${JSON.stringify(WAITING_HTML)};
    if (extra) {
      const p = document.createElement('p');
      p.className = 'error';
      p.textContent = extra;
      host.querySelector('.waiting').appendChild(p);
    }
  }

  // Block submission while a selected option's required text is empty
  function validate(form) {
    let firstMissing = null;
    form.querySelectorAll('.inline-text[data-required]').forEach(t => {
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

  async function send(form) {
    if (!validate(form)) return;
    const btn = form.querySelector('#submit-btn');
    btn.disabled = true;
    const body = new URLSearchParams(new FormData(form));
    body.set('round', form.dataset.round);
    let res;
    try {
      res = await fetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
      });
    } catch {
      btn.disabled = false;
      return;
    }
    if (res.ok) showWaiting();
    // A stale round (409) means the question was already answered or timed out
    else if (res.status === 409) showWaiting('この質問はすでに締め切られました。');
    else btn.disabled = false;
  }

  function bind() {
    const form = host.querySelector('#answer-form');
    if (!form) return;
    // Enter must never submit: confirming an IME conversion (Japanese input)
    // fires a keydown that would otherwise trigger submission.
    form.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
    });
    // Focusing an inline text field checks its radio/checkbox automatically
    form.querySelectorAll('.inline-text').forEach(t => {
      t.addEventListener('focus', () => {
        const input = t.closest('label').querySelector('input[type=radio],input[type=checkbox]');
        if (input) input.checked = true;
      });
    });
    form.querySelector('#submit-btn').addEventListener('click', () => send(form));
  }

  // Later rounds arrive over SSE and replace the form in place, so the user
  // keeps one tab instead of getting a fresh one opened per question.
  async function loadRound() {
    const res = await fetch('/form');
    if (res.status === 204) { showWaiting(); return; }
    host.innerHTML = await res.text();
    bind();
    window.focus();
  }

  bind();
  new EventSource('/events').addEventListener('round', loadRound);
</script>
</body>
</html>`;
}

/** Full page for a round. Kept as the GET / response and for tests. */
export function renderPage(questions: Question[], roundId = 1): string {
  return renderShell(renderForm(questions, roundId));
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

/** URL of the shared form server; empty until the first round starts. */
export function formUrl(): string {
  return baseUrl;
}

interface Round {
  id: number;
  questions: Question[];
  resolve: (answers: Answer[]) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

// One HTTP server and one browser tab are shared by every round in the
// process. Opening a tab costs the user ~1s of waiting and leaves clutter
// behind, so we pay it once instead of once per question.
let httpServer: http.Server | null = null;
let baseUrl = "";
const clients = new Set<http.ServerResponse>();
let current: Round | null = null;
const pending: Round[] = [];
let nextRoundId = 1;

function broadcast(): void {
  for (const res of clients) res.write("event: round\ndata: 1\n\n");
}

/** Show the current round: reuse a live tab if there is one, else open one. */
function present(): void {
  if (clients.size > 0) {
    broadcast();
    return;
  }
  console.error(`[ask-user-question] Answer form: ${baseUrl}`);
  openBrowser(baseUrl);
}

/** Move on to the next queued round, if any. */
function advance(): void {
  if (current || pending.length === 0) return;
  current = pending.shift()!;
  present();
}

function settle(round: Round, answers: Answer[] | null, error?: Error): void {
  clearTimeout(round.timer);
  if (current?.id === round.id) current = null;
  else {
    const i = pending.indexOf(round);
    if (i >= 0) pending.splice(i, 1);
  }
  if (answers) round.resolve(answers);
  else round.reject(error!);
  advance();
}

function handle(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      current ? renderPage(current.questions, current.id) : renderShell(WAITING_HTML)
    );
    return;
  }
  if (req.method === "GET" && req.url === "/form") {
    if (!current) {
      res.writeHead(204).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderForm(current.questions, current.id));
    return;
  }
  if (req.method === "GET" && req.url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    clients.add(res);
    // Comment frames keep proxies and the browser from dropping an idle stream
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.on("close", () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return;
  }
  if (req.method === "POST" && req.url === "/submit") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const round = current;
      // A tab left open on an already-answered or timed-out round
      if (!round || params.get("round") !== String(round.id)) {
        res.writeHead(409).end();
        return;
      }
      res.writeHead(200).end();
      settle(round, decodeAnswers(round.questions, params));
    });
    return;
  }
  res.writeHead(404).end("Not Found");
}

function ensureServer(): Promise<void> {
  if (httpServer) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const server = http.createServer(handle);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}/`;
      httpServer = server;
      // Never hold the process open on the form's account
      server.unref();
      resolve();
    });
  });
}

/**
 * Present the questions in the shared browser tab and resolve once the user
 * submits (or reject on timeout). Concurrent calls are queued and shown in
 * turn, since there is only one tab.
 */
export async function collectAnswers(
  questions: Question[],
  timeoutMs: number
): Promise<Answer[]> {
  await ensureServer();
  return new Promise<Answer[]>((resolve, reject) => {
    const round: Round = {
      id: nextRoundId++,
      questions,
      resolve,
      reject,
      timer: setTimeout(() => {
        // Drop the stale form from any open tab
        const wasCurrent = current?.id === round.id;
        settle(
          round,
          null,
          new Error(
            `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for the user to answer.`
          )
        );
        if (wasCurrent && !current) broadcast();
      }, timeoutMs),
    };
    pending.push(round);
    advance();
  });
}
