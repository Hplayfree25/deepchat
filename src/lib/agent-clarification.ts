export interface AgentClarificationOption {
  shortcut: '1' | '2' | '3' | '4';
  label: string;
  value: string;
  tone?: 'primary' | 'muted';
}

export interface AgentClarification {
  question: string;
  options: AgentClarificationOption[];
}

export interface AgentClarificationAnswer {
  shortcut: AgentClarificationOption['shortcut'];
  question?: string;
  label: string;
  value: string;
}

const markerStart = '[[DEEPCHAT_CLARIFICATION]]';
const markerEnd = '[[/DEEPCHAT_CLARIFICATION]]';

const fallbackLabels = [
  'Proceed with the safest balanced option',
  'Prioritize speed and simplicity',
  'Prioritize reliability and low risk'
];

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');
const asString = (value: unknown) => typeof value === 'string' ? value.trim() : '';

const normalizeOptions = (value: unknown) => {
  const rawOptions = Array.isArray(value) ? value : [];
  const options = rawOptions.slice(0, 3).map((item, index): AgentClarificationOption => {
    const source = isRecord(item) ? item : {};
    const label = asString(source.label) || asString(source.value) || fallbackLabels[index] || `Option ${index + 1}`;
    return {
      shortcut: String(index + 1) as '1' | '2' | '3',
      label,
      value: asString(source.value) || label,
      tone: 'primary'
    };
  });
  while (options.length < 3) {
    const label = fallbackLabels[options.length] || `Option ${options.length + 1}`;
    options.push({
      shortcut: String(options.length + 1) as '1' | '2' | '3',
      label,
      value: label,
      tone: 'primary'
    });
  }
  options.push({
    shortcut: '4',
    label: 'No, I want change',
    value: 'No, I want change',
    tone: 'muted'
  });
  return options;
};

export const buildClarificationInstruction = () => [
  'Clarification protocol is strict.',
  'Before using tools or MCP, decide whether one missing decision would materially change the result.',
  'If clarification is required, ask exactly one concise question and create exactly three context-specific answer options yourself.',
  'Never ask a plain-text clarification question. Never write visible markdown choices, numbered lists, "Options", or "Choices".',
  'When clarification is required, your visible text may contain at most one short sentence before the payload, and the actual question/options must be only inside this payload:',
  `${markerStart}{"question":"...","options":[{"label":"...","value":"..."},{"label":"...","value":"..."},{"label":"...","value":"..."}]}${markerEnd}`,
  'The three options must be distinct, useful, and adapted to the user request. Do not use generic placeholders.',
  'Do not continue to tool use or final analysis when you ask a clarification question.',
  'If you cannot create three useful options, do not ask clarification; continue with explicit assumptions instead.',
  'If clarification is not required, give a short natural first response and do not include the clarification marker.'
].join('\n');

export const parseAgentClarification = (content: string): { visibleContent: string; clarification?: AgentClarification } => {
  const start = content.indexOf(markerStart);
  const end = content.indexOf(markerEnd);
  if (start === -1 || end === -1 || end <= start) return { visibleContent: content };
  const before = content.slice(0, start).trim();
  const rawJson = content.slice(start + markerStart.length, end).trim();
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!isRecord(parsed)) return { visibleContent: before };
    const question = asString(parsed.question);
    if (!question) return { visibleContent: before };
    return {
      visibleContent: before,
      clarification: {
        question,
        options: normalizeOptions(parsed.options)
      }
    };
  } catch {
    return { visibleContent: before };
  }
};

export const formatClarificationAnswer = (clarification: AgentClarification, option: AgentClarificationOption, customValue?: string) => {
  const answer = option.shortcut === '4' && customValue?.trim() ? customValue.trim() : option.value;
  return `Continue the original task using this clarification answer. Do not ask the same clarification again.\n\n${clarification.question}\n\nAnswer ${option.shortcut}: ${answer}`;
};

export const isGeneratedClarificationAnswerContent = (content?: string) => {
  const value = (content || '').trim();
  return Boolean(value && /\n\s*\nAnswer [1-4]:\s*\S/i.test(value));
};

export const parseGeneratedClarificationAnswerContent = (content?: string): AgentClarificationAnswer | null => {
  const value = (content || '').trim();
  const match = value.match(/(?:^|\n\s*\n)([\s\S]*?)\n\s*\nAnswer ([1-4]):\s*([\s\S]+)$/i);
  if (!match) return null;
  const shortcut = match[2] as AgentClarificationOption['shortcut'];
  const question = match[1]
    .replace(/^Continue the original task using this clarification answer\.\s*/i, '')
    .replace(/^Do not ask the same clarification again\.\s*/i, '')
    .trim();
  const answer = match[3].trim();
  if (!answer) return null;
  return {
    shortcut,
    question,
    label: answer,
    value: answer
  };
};
