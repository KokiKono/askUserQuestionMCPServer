import { z } from "zod";

export const OptionSchema = z
  .object({
    label: z
      .string()
      .min(1, "Option label must not be empty")
      .max(200, "Option label must not exceed 200 characters")
      .describe("Short label shown to the user (e.g. 'AWS')."),
    description: z
      .string()
      .max(2000, "Option description must not exceed 2000 characters")
      .optional()
      .describe("Optional supplementary explanation shown under the label."),
  })
  .strict();

export const QuestionSchema = z
  .object({
    question: z
      .string()
      .min(1, "Question text must not be empty")
      .max(1000, "Question text must not exceed 1000 characters")
      .describe("The question text shown as the heading."),
    description: z
      .string()
      .max(5000, "Question description must not exceed 5000 characters")
      .optional()
      .describe("Optional supplementary context shown under the question."),
    multiSelect: z
      .boolean()
      .default(false)
      .describe("Allow selecting multiple options (checkboxes instead of radio buttons)."),
    options: z
      .array(OptionSchema)
      .max(100, "A question may have at most 100 options")
      .default([])
      .describe(
        "Choices for this question. Omit (or pass an empty array) to make it a free-text question. " +
          'An "Other (free text)" option is always added automatically to choice questions.'
      ),
  })
  .strict();

export const AskUserQuestionsInputSchema = {
  questions: z
    .array(QuestionSchema)
    .min(1, "At least one question is required")
    .max(100, "At most 100 questions per call")
    .describe("Questions to present to the user, in display order."),
  timeoutSeconds: z
    .number()
    .int()
    .min(1)
    .max(86400)
    .default(600)
    .describe("How long to wait for the user to submit the form, in seconds (default: 600)."),
};

export const AnswerSchema = z
  .object({
    question: z.string().describe("The question text this answer belongs to."),
    answers: z
      .array(z.string())
      .describe(
        "Selected option labels, or a single-element array with the free-text answer. " +
          "Empty when the user left the question unanswered."
      ),
    other: z
      .string()
      .optional()
      .describe('Free text the user entered in the "Other" field, if they chose it.'),
  })
  .strict();

export const AskUserQuestionsOutputSchema = {
  answers: z.array(AnswerSchema).describe("One entry per question, in the same order as the input."),
};

export type QuestionOption = z.infer<typeof OptionSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Answer = z.infer<typeof AnswerSchema>;
