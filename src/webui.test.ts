import test from "node:test";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  collectAnswers,
  decodeAnswers,
  formUrl,
  renderForm,
  renderPage,
} from "./webui.js";
import { QuestionSchema, type Question } from "./schemas.js";

const QuestionsSchema = z.array(QuestionSchema);

function q(input: unknown[]): Question[] {
  return QuestionsSchema.parse(input);
}

test("schema applies defaults (free-text, single-select)", () => {
  const [parsed] = q([{ question: "補足があれば" }]);
  assert.deepEqual(parsed, {
    question: "補足があれば",
    multiSelect: false,
    options: [],
  });
});

test("schema rejects empty question text and unknown fields", () => {
  assert.throws(() => q([{ question: "" }]));
  assert.throws(() => q([{ question: "x", extra: true }]));
});

test("decodeAnswers: single-select returns the chosen label", () => {
  const questions = q([
    {
      question: "デプロイ先は?",
      options: [{ label: "AWS" }, { label: "GCP" }],
    },
  ]);
  const answers = decodeAnswers(questions, new URLSearchParams("q0=1"));
  assert.deepEqual(answers, [{ question: "デプロイ先は?", answers: ["GCP"] }]);
});

test("decodeAnswers: multi-select returns all chosen labels", () => {
  const questions = q([
    {
      question: "機能は?",
      multiSelect: true,
      options: [{ label: "認証" }, { label: "通知" }, { label: "検索" }],
    },
  ]);
  const answers = decodeAnswers(
    questions,
    new URLSearchParams("q0=0&q0=2")
  );
  assert.deepEqual(answers, [{ question: "機能は?", answers: ["認証", "検索"] }]);
});

test("decodeAnswers: other option captures free text", () => {
  const questions = q([
    { question: "デプロイ先は?", options: [{ label: "AWS" }] },
  ]);
  const answers = decodeAnswers(
    questions,
    new URLSearchParams("q0=__other__&q0_other=%E3%82%AA%E3%83%B3%E3%83%97%E3%83%AC")
  );
  assert.deepEqual(answers, [
    { question: "デプロイ先は?", answers: [], other: "オンプレ" },
  ]);
});

test("decodeAnswers: free-text question", () => {
  const questions = q([{ question: "補足があれば" }]);
  assert.deepEqual(
    decodeAnswers(questions, new URLSearchParams("q0_text=%E7%89%B9%E3%81%AB%E3%81%AA%E3%81%97")),
    [{ question: "補足があれば", answers: ["特になし"] }]
  );
  assert.deepEqual(decodeAnswers(questions, new URLSearchParams("q0_text=")), [
    { question: "補足があれば", answers: [] },
  ]);
});

test("decodeAnswers: ignores out-of-range option indexes", () => {
  const questions = q([
    { question: "デプロイ先は?", options: [{ label: "AWS" }] },
  ]);
  assert.deepEqual(decodeAnswers(questions, new URLSearchParams("q0=99")), [
    { question: "デプロイ先は?", answers: [] },
  ]);
});

test("decodeAnswers: textInput option captures per-option text", () => {
  const questions = q([
    {
      question: "格上げしますか?",
      options: [
        { label: "格上げする", textInput: { placeholder: "出所URL", required: true } },
        { label: "据え置き" },
      ],
    },
  ]);
  const answers = decodeAnswers(
    questions,
    new URLSearchParams("q0=0&q0_opt0_text=https%3A%2F%2Fexample.com%2Fissues%2F123")
  );
  assert.deepEqual(answers, [
    {
      question: "格上げしますか?",
      answers: ["格上げする"],
      optionTexts: { "格上げする": "https://example.com/issues/123" },
    },
  ]);
});

test("decodeAnswers: textInput text is ignored when its option is not selected", () => {
  const questions = q([
    {
      question: "格上げしますか?",
      options: [
        { label: "格上げする", textInput: {} },
        { label: "据え置き" },
      ],
    },
  ]);
  const answers = decodeAnswers(
    questions,
    new URLSearchParams("q0=1&q0_opt0_text=stale")
  );
  assert.deepEqual(answers, [{ question: "格上げしますか?", answers: ["据え置き"] }]);
});

test("decodeAnswers: multi-select collects texts from multiple textInput options", () => {
  const questions = q([
    {
      question: "対応方針は?",
      multiSelect: true,
      options: [
        { label: "修正", textInput: { placeholder: "PR URL" } },
        { label: "起票", textInput: { placeholder: "チケット" } },
        { label: "無視" },
      ],
    },
  ]);
  const answers = decodeAnswers(
    questions,
    new URLSearchParams("q0=0&q0=1&q0_opt0_text=pr-1&q0_opt1_text=JIRA-2")
  );
  assert.deepEqual(answers, [
    {
      question: "対応方針は?",
      answers: ["修正", "起票"],
      optionTexts: { 修正: "pr-1", 起票: "JIRA-2" },
    },
  ]);
});

test("renderPage renders textInput field with placeholder and required marker", () => {
  const questions = q([
    {
      question: "格上げしますか?",
      options: [
        { label: "格上げする", textInput: { placeholder: "出所URL", required: true } },
      ],
    },
  ]);
  const html = renderPage(questions);
  assert.ok(html.includes('name="q0_opt0_text"'));
  assert.ok(html.includes('placeholder="出所URL"'));
  assert.ok(html.includes('data-required="1"'));
});

test("renderPage escapes HTML in questions and options", () => {
  const questions = q([
    {
      question: '<script>alert("x")</script>',
      description: "a & b",
      options: [{ label: "<b>bold</b>", description: '"quoted"' }],
    },
  ]);
  const html = renderPage(questions);
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("a &amp; b"));
  assert.ok(html.includes("&lt;b&gt;bold&lt;/b&gt;"));
  assert.ok(html.includes("&quot;quoted&quot;"));
});

test("renderForm pre-selects a recommended option and badges it", () => {
  const questions = q([
    {
      question: "デプロイ先は?",
      options: [{ label: "AWS" }, { label: "GCP", recommended: true }],
    },
  ]);
  const html = renderForm(questions);
  assert.match(html, /name="q0" value="1" checked/);
  assert.doesNotMatch(html, /name="q0" value="0" checked/);
  assert.ok(html.includes('<span class="rec">推奨</span>'));
});

test("renderForm pre-selects only the first recommendation in single-select", () => {
  const questions = q([
    {
      question: "デプロイ先は?",
      options: [
        { label: "AWS", recommended: true },
        { label: "GCP", recommended: true },
      ],
    },
  ]);
  const html = renderForm(questions);
  assert.equal(html.match(/checked/g)?.length, 1);
});

test("renderForm pre-selects every recommendation in multi-select", () => {
  const questions = q([
    {
      question: "機能は?",
      multiSelect: true,
      options: [
        { label: "認証", recommended: true },
        { label: "通知" },
        { label: "検索", recommended: true },
      ],
    },
  ]);
  const html = renderForm(questions);
  assert.equal(html.match(/checked/g)?.length, 2);
});

test("renderForm carries the round id so stale tabs can be rejected", () => {
  const html = renderForm(q([{ question: "補足があれば" }]), 7);
  assert.ok(html.includes('data-round="7"'));
});

test("renderPage embeds the form inside the shell", () => {
  const questions = q([{ question: "補足があれば" }]);
  const page = renderPage(questions, 3);
  assert.ok(page.startsWith("<!doctype html>"));
  assert.ok(page.includes('data-round="3"'));
  assert.ok(page.includes("EventSource"));
});

test("collectAnswers reuses one server across rounds and honours submissions", async () => {
  process.env.ASK_USER_QUESTION_NO_OPEN = "1";
  const questions = q([
    { question: "デプロイ先は?", options: [{ label: "AWS" }, { label: "GCP" }] },
  ]);

  const first = collectAnswers(questions, 10_000);
  const url = await waitForUrl();
  const page = await (await fetch(url)).text();
  const round = /data-round="(\d+)"/.exec(page)![1];

  const res = await fetch(new URL("/submit", url), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `round=${round}&q0=1`,
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await first, [{ question: "デプロイ先は?", answers: ["GCP"] }]);

  // Resubmitting the now-stale round must not corrupt a later one
  const stale = await fetch(new URL("/submit", url), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `round=${round}&q0=0`,
  });
  assert.equal(stale.status, 409);

  // No active round: the shell is served and /form reports nothing to show
  assert.equal((await fetch(new URL("/form", url))).status, 204);

  // A second call must land on the same origin, not a fresh server
  const second = collectAnswers(questions, 10_000);
  const nextRound = /data-round="(\d+)"/.exec(
    await (await fetch(new URL("/form", url))).text()
  )![1];
  assert.notEqual(nextRound, round);
  await fetch(new URL("/submit", url), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `round=${nextRound}&q0=0`,
  });
  assert.deepEqual(await second, [{ question: "デプロイ先は?", answers: ["AWS"] }]);
});

/** collectAnswers binds its port asynchronously; wait for it to be listening. */
async function waitForUrl(): Promise<string> {
  for (let i = 0; i < 100; i++) {
    if (formUrl()) return formUrl();
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("server did not start");
}

test("フォームサーバーはプロセスの終了を妨げない", async () => {
  // 常駐サーバーは回答待ちが無くなってもリスンし続けるので、イベントループを
  // 保持しないことを実プロセスで確かめる。保持していればこの子プロセスは
  // 終了せずタイムアウトする。
  const script = `
    process.env.ASK_USER_QUESTION_NO_OPEN = "1";
    const { collectAnswers, formUrl } = await import(${JSON.stringify(
      new URL("./webui.js", import.meta.url).href
    )});
    const p = collectAnswers([{ question: "Q?", multiSelect: false, options: [{ label: "A" }] }], 30000);
    while (!formUrl()) await new Promise((r) => setTimeout(r, 5));
    const round = /data-round="(\\d+)"/.exec(await (await fetch(formUrl())).text())[1];
    await fetch(new URL("/submit", formUrl()), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "round=" + round + "&q0=0",
    });
    await p;
    // process.exit() は呼ばない。サーバーが握っていればここでハングする。
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
    stdio: "ignore",
  });
  const exited = new Promise<number | null>((resolve) => {
    child.on("exit", (code) => resolve(code));
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
  const code = await exited;
  clearTimeout(timer);
  assert.equal(code, 0, "回答後もプロセスが終了しない（サーバーがイベントループを保持している）");
});
