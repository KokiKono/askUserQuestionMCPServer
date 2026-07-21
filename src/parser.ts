export interface QuestionOption {
  label: string;
  description: string;
}

export interface Question {
  /** Question text (the H1 heading text) */
  question: string;
  /** Supplementary description (body paragraphs under the heading) */
  description: string;
  /** Choices. Empty array means free-text question. */
  options: QuestionOption[];
  /** True when options are written as checkbox list items (- [ ] item) */
  multiSelect: boolean;
}

/**
 * Parse a markdown questionnaire.
 *
 * Format:
 *   # <question>          ... level-1 heading starts a question
 *   <paragraph>           ... optional description
 *   - label: description  ... single-select option
 *   - [ ] label: descr    ... multi-select option (checkbox list)
 *
 * A question with no list items becomes a free-text question.
 */
export function parseQuestionsMarkdown(markdown: string): Question[] {
  const lines = markdown.split(/\r?\n/);
  const questions: Question[] = [];
  let current: Question | null = null;
  let descLines: string[] = [];

  const flushDesc = () => {
    const text = descLines.join("\n").trim();
    if (current && text) {
      current.description = current.description
        ? `${current.description}\n${text}`
        : text;
    }
    descLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      flushDesc();
      current = {
        question: h1[1].trim(),
        description: "",
        options: [],
        multiSelect: false,
      };
      questions.push(current);
      continue;
    }
    if (!current) {
      // Ignore content before the first H1
      continue;
    }
    const checkbox = line.match(/^[-*]\s+\[[ xX]?\]\s+(.+)$/);
    const bullet = checkbox ? null : line.match(/^[-*]\s+(.+)$/);
    if (checkbox || bullet) {
      flushDesc();
      const body = (checkbox ? checkbox[1] : bullet![1]).trim();
      // Split on full-width colon, or half-width colon followed by a space
      // (so URLs like "http://..." inside a label are not split)
      const sep = body.match(/^(.*?)\s*(?:：|:\s)\s*(.+)$/);
      current.options.push(
        sep
          ? { label: sep[1].trim(), description: sep[2].trim() }
          : { label: body, description: "" }
      );
      if (checkbox) {
        current.multiSelect = true;
      }
      continue;
    }
    descLines.push(rawLine);
  }
  flushDesc();

  if (questions.length === 0) {
    throw new Error(
      "No questions found. Each question must start with a level-1 heading (`# question text`)."
    );
  }
  return questions;
}
