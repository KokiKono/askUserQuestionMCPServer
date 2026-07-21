# askUserQuestion MCP Server

Claude Code 標準の `AskUserQuestion` の拡張版 MCP サーバーです。

標準ツールは質問・選択肢が最大4つまでという制限がありますが、このサーバーは **質問数・選択肢数ともに無制限** です。ツールが呼ばれるとローカル HTTP サーバーが起動し、ブラウザに回答フォームが開きます。ユーザーが送信するまでブロックし、回答を JSON で返します。

## セットアップ

```bash
npm install
npm run build
```

Claude Code への登録:

```bash
claude mcp add ask-user-question -- node /path/to/askUserQuestionMCPServer/dist/index.js
```

## ツール: `ask_user_questions`

| 引数 | 型 | 説明 |
|---|---|---|
| `markdown` | string | 質問票 (下記フォーマット) |
| `timeoutSeconds` | number (任意) | 回答待ちタイムアウト。デフォルト 600 秒 |

### Markdown フォーマット

- **見出しレベル1 (`# ...`) が1つの設問** になります
- 見出し直下の本文段落は設問の補足説明になります
- リスト項目 (`- ラベル: 説明`) が選択肢になります (`:` または `：` でラベルと説明を区切る。説明は省略可)
- チェックボックス記法 (`- [ ] ...`) を使うと **複数選択可** の設問になります
- リスト項目のない設問は **自由記述** (テキストエリア) になります
- すべての選択式設問に「その他 (自由記述)」が自動で追加されます

```markdown
# デプロイ先はどこにしますか?

本番環境の構成を決めます。

- AWS: ECS Fargateを想定
- GCP: Cloud Run
- オンプレ: 既存サーバー
- 未定

# 使いたい機能はどれですか?

- [ ] 認証: ログイン機能
- [ ] 通知: メール通知
- [ ] 検索

# その他補足があれば教えてください
```

### 戻り値

```json
{
  "answers": [
    { "question": "デプロイ先はどこにしますか?", "answers": ["AWS"] },
    { "question": "使いたい機能はどれですか?", "answers": ["認証", "検索"], "other": "CSV エクスポート" },
    { "question": "その他補足があれば教えてください", "answers": ["特になし"] }
  ]
}
```

## 開発

```bash
npm run build   # TypeScript ビルド
npm test        # パーサーのユニットテスト
```

環境変数 `ASK_USER_QUESTION_NO_OPEN=1` を設定するとブラウザの自動オープンを抑止します (テスト用)。フォームの URL は stderr にログ出力されます。
