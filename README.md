# askUserQuestion MCP Server

Claude Code 標準の `AskUserQuestion` の拡張版 MCP サーバーです。

標準ツールは質問・選択肢が最大4つまでという制限がありますが、このサーバーは **質問数・選択肢数ともに無制限** です。ツールが呼ばれるとローカル HTTP サーバーが起動し、ブラウザに回答フォームが開きます。ユーザーが送信するまでブロックし、回答を構造化データ (structuredContent) で返します。

HTTP サーバーとブラウザタブはプロセス内で使い回します。2回目以降の質問は開いたままのタブに差し替えで表示されるので、質問ごとに新しいタブが開くことはありません。

### フォームサーバーのプロセス寿命

回答フォームのサーバーは常駐しますが、**ホストプロセスの終了を妨げません**。回答待ちが無くなれば、
フォームのサーバーが起動したままでもプロセスは自力で終了します（MCP サーバーとしての寿命は標準入出力の
接続が決めるもので、フォームのサーバーはそれに関与しない、という方針です）。

この性質はテストで検証しています（`回答後にプロセスが自力で終了する`）。

## セットアップ

npm パッケージとして公開されているので、Claude Code へはインストール不要で登録できます:

```bash
claude mcp add ask-user-question -- npx -y ask-user-question-mcp-server
```

### ソースから使う場合

```bash
npm install
npm run build
claude mcp add ask-user-question -- node /path/to/askUserQuestionMCPServer/dist/index.js
```

## ツール: `ask_user_questions`

### 引数

| 引数 | 型 | 説明 |
|---|---|---|
| `questions` | array (必須) | 質問の配列 (表示順)。下記参照 |
| `timeoutSeconds` | integer (任意) | 回答待ちタイムアウト。デフォルト 600 秒 |

各質問オブジェクト:

| フィールド | 型 | 説明 |
|---|---|---|
| `question` | string (必須) | 質問文 (見出しとして表示) |
| `description` | string (任意) | 質問の補足説明 |
| `multiSelect` | boolean (任意, デフォルト false) | 複数選択を許可 (チェックボックス表示) |
| `options` | array (任意) | 選択肢 `{ label, description?, recommended?, textInput? }` の配列。省略すると **自由記述** (テキストエリア) になる |

すべての選択式設問に「その他 (自由記述)」が自動で追加されます。

選択肢に `recommended: true` を付けると **その選択肢が選択済みの状態でフォームが開きます**。異論がなければユーザーはそのまま送信ボタンを押すだけで済みます。単一選択では最初の1つだけが選択されます。

選択肢の `textInput` (`{ placeholder?, required? }`) を指定すると、**その選択肢を選んだときだけ有効な自由記述欄**が付きます。「格上げする → 出所URLをその場で記入」のように、追加の詳細を同じ1コールで回収できます。`required: true` なら未記入のまま送信できません。

### リクエスト例

```json
{
  "questions": [
    {
      "question": "デプロイ先はどこにしますか?",
      "description": "本番環境の構成を決めます。",
      "options": [
        { "label": "AWS", "description": "ECS Fargateを想定" },
        { "label": "GCP", "description": "Cloud Run" },
        { "label": "オンプレ", "description": "既存サーバー" }
      ]
    },
    {
      "question": "使いたい機能はどれですか?",
      "multiSelect": true,
      "options": [
        { "label": "認証", "description": "ログイン機能" },
        { "label": "通知", "description": "メール通知" },
        { "label": "検索" }
      ]
    },
    {
      "question": "この指摘を格上げしますか?",
      "options": [
        {
          "label": "格上げする",
          "textInput": { "placeholder": "出所URL / チケット番号", "required": true }
        },
        { "label": "据え置き" }
      ]
    },
    { "question": "その他補足があれば教えてください" }
  ],
  "timeoutSeconds": 600
}
```

### 戻り値

`structuredContent` (および同内容の JSON テキスト) で返ります:

```json
{
  "answers": [
    { "question": "デプロイ先はどこにしますか?", "answers": ["AWS"] },
    { "question": "使いたい機能はどれですか?", "answers": ["認証", "検索"], "other": "CSV エクスポート" },
    {
      "question": "この指摘を格上げしますか?",
      "answers": ["格上げする"],
      "optionTexts": { "格上げする": "https://example.com/issues/123" }
    },
    { "question": "その他補足があれば教えてください", "answers": ["特になし"] }
  ]
}
```

- `answers` — 選択したラベルの配列。自由記述設問は回答テキスト1要素の配列。未回答なら空配列
- `other` — 「その他」を選んだ場合のみ存在する自由記述テキスト
- `optionTexts` — `textInput` 付き選択肢を選んで記入した場合のみ存在する、`{ 選択肢ラベル: 記入テキスト }` のマップ

タイムアウト時は `isError` 付きのエラーメッセージを返します。

## 開発

```bash
npm run build   # クリーンビルド (dist/ を作り直し)
npm test        # ユニットテスト (スキーマ / フォームデコード / HTMLエスケープ)
```

環境変数 `ASK_USER_QUESTION_NO_OPEN=1` を設定するとブラウザの自動オープンを抑止します (テスト用)。フォームの URL は stderr にログ出力されます。
