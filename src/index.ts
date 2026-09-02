#!/usr/bin/env node
/**
 * ask-user-question-mcp-server
 *
 * Extended AskUserQuestion as an MCP server: presents any number of questions
 * to the user in a local web form and blocks until they submit their answers.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  AskUserQuestionsInputSchema,
  AskUserQuestionsOutputSchema,
} from "./schemas.js";
import type { Answer } from "./schemas.js";
import { collectAnswers } from "./webui.js";

/** Compact, loss-free rendering of the answers for the text content block. */
function digestAnswers(answers: Answer[]): string {
  return answers
    .map((a) => {
      const picked = [...a.answers];
      if (a.other !== undefined) picked.push(`Other: ${a.other}`);
      const lines = [
        `Q: ${a.question}`,
        `A: ${picked.length > 0 ? picked.join(" / ") : "(no answer)"}`,
      ];
      for (const [label, text] of Object.entries(a.optionTexts ?? {})) {
        lines.push(`   ${label} -> ${text}`);
      }
      return lines.join("\n");
    })
    .join("\n");
}

const server = new McpServer({
  name: "ask-user-question-mcp-server",
  version: "0.4.0",
});

server.registerTool(
  "ask_user_questions",
  {
    title: "Ask the user questions (unlimited)",
    description: `Ask the user any number of questions in a local browser form and block until they answer.

Prefer the built-in AskUserQuestion for up to 4 questions with up to 4 short options each. Use this tool when you exceed either limit, or when an answer needs a follow-up detail.

Args:
  - questions (required): [{ question, description?, multiSelect?, options? }] in display order.
      options: [{ label, description?, recommended?, textInput? }]
        - Omit options entirely for a free-text question. An "Other" choice is always added.
        - recommended: pre-select your best guess so the user can confirm in one click.
        - textInput ({ placeholder?, required? }): a free-text field shown when that option is
          selected. Use it to collect the detail now instead of asking again later.
  - timeoutSeconds (default 600).

Returns { answers: [{ question, answers[], other?, optionTexts? }] }, one entry per question in
input order. answers is [] if the user skipped it. On timeout, returns an error: the user may have
missed the tab, so either retry with a longer timeout or proceed on a stated assumption.`,
    inputSchema: AskUserQuestionsInputSchema,
    outputSchema: AskUserQuestionsOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ questions, timeoutSeconds }) => {
    try {
      const answers = await collectAnswers(questions, timeoutSeconds * 1000);
      const output = { answers };
      return {
        // A digest rather than the JSON: clients that read structuredContent
        // would otherwise be handed every answer twice.
        content: [{ type: "text", text: digestAnswers(answers) }],
        structuredContent: output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${message} The user may not have seen the form; try again with a longer timeoutSeconds, or proceed with sensible defaults and note the assumption.`,
          },
        ],
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[ask-user-question] MCP server running on stdio");
