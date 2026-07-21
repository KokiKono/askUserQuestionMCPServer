import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { decodeAnswers, renderPage } from "./webui.js";
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
