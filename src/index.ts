#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseQuestionsMarkdown } from "./parser.js";
import { collectAnswers } from "./webui.js";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

const server = new McpServer({
  name: "ask-user-question",
  version: "0.1.0",
});

server.registerTool(
  "ask_user_questions",
  {
    title: "Ask the user questions (unlimited)",
    description: [
      "Present any number of questions to the user in a local web form and wait for their answers.",
      "Use this instead of the built-in AskUserQuestion when you need more than 4 questions or more than 4 options.",
      "",
      "The `markdown` argument uses this format:",
      "  # Question text            <- each level-1 heading is one question",
      "  Optional description paragraph.",
      "  - Label: description      <- single-select option",
      "  - [ ] Label: description  <- checkbox syntax makes the question multi-select",
      "",
      "A question with no list items becomes a free-text question.",
      'An "Other (free text)" option is always added automatically.',
      "The tool blocks until the user submits the form, then returns their answers as JSON.",
    ].join("\n"),
    inputSchema: {
      markdown: z
        .string()
        .describe(
          "Questionnaire in markdown. Each level-1 heading (`# ...`) is a question; list items are its options."
        ),
      timeoutSeconds: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("How long to wait for the user (default: 600 seconds)."),
    },
  },
  async ({ markdown, timeoutSeconds }) => {
    const questions = parseQuestionsMarkdown(markdown);
    const timeoutMs = (timeoutSeconds ?? DEFAULT_TIMEOUT_MS / 1000) * 1000;
    const answers = await collectAnswers(questions, timeoutMs);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ answers }, null, 2),
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[ask-user-question] MCP server running on stdio");
