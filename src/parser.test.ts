import test from "node:test";
import assert from "node:assert/strict";
import { parseQuestionsMarkdown } from "./parser.js";

test("parses multiple questions with options", () => {
  const md = `
# デプロイ先はどこにしますか?

本番環境の構成を決めます。

- AWS: ECS Fargateを想定
- GCP: Cloud Run
- オンプレ: 既存サーバー
- 未定

# 使いたい機能はどれですか?

- [ ] 認証: ログイン機能
- [ ] 通知: メール通知
- [x] 検索

# 補足があれば教えてください
`;
  const qs = parseQuestionsMarkdown(md);
  assert.equal(qs.length, 3);

  assert.equal(qs[0].question, "デプロイ先はどこにしますか?");
  assert.equal(qs[0].description, "本番環境の構成を決めます。");
  assert.equal(qs[0].multiSelect, false);
  assert.deepEqual(qs[0].options[0], {
    label: "AWS",
    description: "ECS Fargateを想定",
  });
  assert.deepEqual(qs[0].options[3], { label: "未定", description: "" });

  assert.equal(qs[1].multiSelect, true);
  assert.equal(qs[1].options.length, 3);
  assert.equal(qs[1].options[0].label, "認証");

  assert.equal(qs[2].options.length, 0);
});

test("supports full-width colon and does not split URLs", () => {
  const qs = parseQuestionsMarkdown(
    "# Q\n- ラベル：全角コロン\n- http://example.com\n"
  );
  assert.deepEqual(qs[0].options[0], {
    label: "ラベル",
    description: "全角コロン",
  });
  assert.deepEqual(qs[0].options[1], {
    label: "http://example.com",
    description: "",
  });
});

test("throws when no H1 heading exists", () => {
  assert.throws(() => parseQuestionsMarkdown("just text\n- item"));
});
