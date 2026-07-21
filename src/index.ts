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
import { collectAnswers } from "./webui.js";

const server = new McpServer({
  name: "ask-user-question-mcp-server",
  version: "0.2.0",
});

server.registerTool(
  "ask_user_questions",
  {
    title: "Ask the user questions (unlimited)",
    description: `Present any number of questions to the user in a local web form and wait for their answers.

Use this instead of the built-in AskUserQuestion when you need more than 4 questions or more than 4 options per question. The tool opens a browser form on the user's machine, blocks until they submit, and returns their answers.

Args:
  - questions (array, required): Questions in display order. Each question:
      - question (string): The question text.
      - description (string, optional): Supplementary context shown under the question.
      - multiSelect (boolean, default false): Allow selecting multiple options.
      - options (array, default []): Choices as { label, description? }. Omit to make
        the question free-text (a textarea). Choice questions automatically get an
        "Other (free text)" option.
  - timeoutSeconds (integer, default 600): How long to wait for the user.

Returns (structured):
  {
    "answers": [
      {
        "question": string,     // The question text, same order as input
        "answers": string[],    // Selected labels, or [free-text answer]; [] if unanswered
        "other": string         // Present only if the user chose "Other"
      }
    ]
  }

Examples:
  - Use when: You have 6 design decisions to confirm at once -> one call with 6 questions
  - Use when: A choice has 10 candidate libraries -> one question with 10 options
  - Don't use when: A single question with <=4 options suffices (prefer the built-in tool)

Error handling:
  - Returns an error if the user does not submit within timeoutSeconds. The user may
    have missed the browser tab; consider asking again with fewer questions or a longer timeout.`,
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
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
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
