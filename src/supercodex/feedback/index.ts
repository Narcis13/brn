import { readTextIfExists, writeTextAtomic } from "../fs.js";
import { resolveRepoPath } from "../paths.js";
import { parseUnitId } from "../planning/index.js";
import { loadCurrentState, saveCurrentState, transitionState } from "../state.js";
import type { CurrentState } from "../types.js";

const QUESTIONS_REF = "vault/feedback/QUESTIONS.md";
const BLOCKERS_REF = "vault/feedback/BLOCKERS.md";
const ANSWERS_REF = "vault/feedback/ANSWERS.md";

const QUESTIONS_TEMPLATE = `# Questions

Use this file for structured questions that require human clarification before work can continue safely.

Current status:

- No open questions.

Entry contract:

- \`## Q-YYYY-MM-DD-001\`
- \`- Scope:\`
- \`- Severity:\`
- \`- Type:\`
- \`- Issue:\`
- \`- Why blocked:\`
- \`- Options:\` with nested bullets when relevant
- \`- Recommended default:\`
- \`- Latest responsible pause point:\`
- \`- Status: open|resolved\`
- \`- Answered by:\`
`;

const BLOCKERS_TEMPLATE = `# Blockers

Use this file for structured blockers that require human action or an irreversible boundary decision.

Current status:

- No active blockers.

Entry contract:

- \`## B-YYYY-MM-DD-001\`
- \`- Scope:\`
- \`- Type:\`
- \`- Blocker:\`
- \`- Required human action:\`
- \`- Prepared artifacts:\` with nested bullets
- \`- Resume condition:\`
- \`- Status: open|resolved\`
- \`- Answered by:\`
`;

const ANSWERS_TEMPLATE = `# Answers

Use this file to answer entries from \`QUESTIONS.md\` or clear blockers from \`BLOCKERS.md\`.

Current status:

- No recorded answers yet.

Entry contract:

- \`## A-YYYY-MM-DD-001\`
- \`- Responds to:\`
- \`- Decision:\`
- \`- Reason:\`
- \`- Entered by:\`
- \`- Entered at:\`
- \`- Status: pending|ingested\`
- \`- Ingested at:\`
`;

const EMPTY_QUESTION_MARKER = "- No open questions.";
const EMPTY_BLOCKER_MARKER = "- No active blockers.";
const EMPTY_ANSWER_MARKER = "- No recorded answers yet.";

interface QuestionEntry {
  id: string;
  scope: string;
  severity: string;
  type: string;
  issue: string;
  why_blocked: string;
  options: string[];
  recommended_default: string;
  latest_pause_point: string;
  status: "open" | "resolved";
  answered_by: string | null;
}

interface BlockerEntry {
  id: string;
  scope: string;
  type: string;
  blocker: string;
  required_human_action: string;
  prepared_artifacts: string[];
  resume_condition: string;
  status: "open" | "resolved";
  answered_by: string | null;
}

interface AnswerEntry {
  id: string;
  responds_to: string;
  decision: string;
  reason: string;
  entered_by: string;
  entered_at: string;
  status: "pending" | "ingested";
  ingested_at: string | null;
}

interface FeedbackDocument<T> {
  header: string;
  entries: T[];
}

export interface CreateQuestionParams {
  scope: string;
  issue: string;
  why_blocked: string;
  severity?: string;
  type?: string;
  options?: string[];
  recommended_default?: string;
  latest_pause_point?: string;
}

export interface CreateBlockerParams {
  scope: string;
  type?: string;
  blocker: string;
  required_human_action: string;
  prepared_artifacts?: string[];
  resume_condition: string;
}

export interface CreateAnswerParams {
  responds_to: string;
  decision: string;
  reason: string;
  entered_by: string;
  entered_at?: string;
}

export interface FeedbackWriteResult {
  ref: string;
  id: string;
  state: CurrentState;
}

export interface FeedbackIngestProcessedEntry {
  answer_id: string;
  target_id: string;
  target_kind: "question" | "blocker";
  scope: string;
}

export interface FeedbackIngestResult {
  ok: boolean;
  processed: FeedbackIngestProcessedEntry[];
  unmatched: string[];
  state: CurrentState;
}

function feedbackPath(root: string, ref: string): string {
  return resolveRepoPath(root, ref);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitDocument(content: string): { header: string; sections: Array<{ id: string; body: string }> } {
  const normalized = content.replace(/\r\n/g, "\n");
  const matches = [...normalized.matchAll(/^## ([^\n]+)\n/gm)];

  if (matches.length === 0) {
    return {
      header: normalized.trimEnd(),
      sections: [],
    };
  }

  const sections = matches.map((match, index) => {
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
    return {
      id: match[1].trim(),
      body: normalized.slice(bodyStart, bodyEnd).trim(),
    };
  });

  return {
    header: normalized.slice(0, matches[0].index ?? 0).trimEnd(),
    sections,
  };
}

function isTemplateEntry(id: string): boolean {
  return id.includes("YYYY-MM-DD");
}

function scalarField(body: string, label: string): string {
  const match = body.match(new RegExp(`^- ${escapeRegExp(label)}:\\s*(.*)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

function listField(body: string, label: string): string[] {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trimStart().startsWith(`- ${label}:`));
  if (start === -1) {
    return [];
  }

  const items: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*$/.test(line)) {
      continue;
    }
    if (/^  - /.test(line)) {
      items.push(line.replace(/^  - /, "").trim());
      continue;
    }
    if (/^- /.test(line.trimStart())) {
      break;
    }
    if (/^\s+/.test(line) && items.length > 0) {
      items[items.length - 1] = `${items[items.length - 1]} ${line.trim()}`.trim();
      continue;
    }
    break;
  }

  return items;
}

function renderListField(label: string, values: string[]): string[] {
  return [`- ${label}:`, ...values.map((value) => `  - ${value}`)];
}

function renderQuestionEntry(entry: QuestionEntry): string {
  return [
    `## ${entry.id}`,
    "",
    `- Scope: ${entry.scope}`,
    `- Severity: ${entry.severity}`,
    `- Type: ${entry.type}`,
    `- Issue: ${entry.issue}`,
    `- Why blocked: ${entry.why_blocked}`,
    ...renderListField("Options", entry.options),
    `- Recommended default: ${entry.recommended_default}`,
    `- Latest responsible pause point: ${entry.latest_pause_point}`,
    `- Status: ${entry.status}`,
    `- Answered by: ${entry.answered_by ?? ""}`,
  ].join("\n");
}

function renderBlockerEntry(entry: BlockerEntry): string {
  return [
    `## ${entry.id}`,
    "",
    `- Scope: ${entry.scope}`,
    `- Type: ${entry.type}`,
    `- Blocker: ${entry.blocker}`,
    `- Required human action: ${entry.required_human_action}`,
    ...renderListField("Prepared artifacts", entry.prepared_artifacts),
    `- Resume condition: ${entry.resume_condition}`,
    `- Status: ${entry.status}`,
    `- Answered by: ${entry.answered_by ?? ""}`,
  ].join("\n");
}

function renderAnswerEntry(entry: AnswerEntry): string {
  return [
    `## ${entry.id}`,
    "",
    `- Responds to: ${entry.responds_to}`,
    `- Decision: ${entry.decision}`,
    `- Reason: ${entry.reason}`,
    `- Entered by: ${entry.entered_by}`,
    `- Entered at: ${entry.entered_at}`,
    `- Status: ${entry.status}`,
    `- Ingested at: ${entry.ingested_at ?? ""}`,
  ].join("\n");
}

function renderDocument(header: string, entries: string[], emptyMarker: string): string {
  const sanitizedHeader = header.replace(`\n${emptyMarker}\n`, "\n").replace(emptyMarker, "").trimEnd();

  if (entries.length === 0) {
    return `${header.trimEnd()}\n`;
  }

  return `${sanitizedHeader}\n\n${entries.join("\n\n")}\n`;
}

function nextFeedbackId(content: string, prefix: "A" | "B" | "Q", dateStamp: string): string {
  const regex = new RegExp(`## ${prefix}-${dateStamp}-(\\d{3})`, "g");
  let max = 0;

  for (const match of content.matchAll(regex)) {
    const value = Number.parseInt(match[1] ?? "0", 10);
    if (value > max) {
      max = value;
    }
  }

  return `${prefix}-${dateStamp}-${String(max + 1).padStart(3, "0")}`;
}

function resolveScopedUnitId(scope: string | null | undefined): string | undefined {
  if (!scope) {
    return undefined;
  }

  return parseUnitId(scope).kind === "unknown" ? undefined : scope;
}

function maybeTransitionForPause(root: string, phase: "awaiting_human" | "blocked", reason: string, scope: string): CurrentState {
  const current = loadCurrentState(root);
  if (current.phase === phase) {
    return current;
  }

  return transitionState(root, phase, reason, resolveScopedUnitId(scope), "feedback");
}

function incrementHumanInterventions(root: string, amount: number): CurrentState {
  const current = loadCurrentState(root);
  const nextState: CurrentState = {
    ...current,
    metrics: {
      ...current.metrics,
      human_interventions: current.metrics.human_interventions + amount,
    },
  };
  saveCurrentState(root, nextState);
  return nextState;
}

function loadQuestionDocument(root: string): FeedbackDocument<QuestionEntry> {
  const content = readTextIfExists(feedbackPath(root, QUESTIONS_REF)) ?? QUESTIONS_TEMPLATE;
  const { header, sections } = splitDocument(content);
  return {
    header: header || QUESTIONS_TEMPLATE.trimEnd(),
    entries: sections
      .filter((section) => !isTemplateEntry(section.id))
      .map((section) => ({
        id: section.id,
        scope: scalarField(section.body, "Scope"),
        severity: scalarField(section.body, "Severity"),
        type: scalarField(section.body, "Type"),
        issue: scalarField(section.body, "Issue"),
        why_blocked: scalarField(section.body, "Why blocked"),
        options: listField(section.body, "Options"),
        recommended_default: scalarField(section.body, "Recommended default"),
        latest_pause_point: scalarField(section.body, "Latest responsible pause point"),
        status: scalarField(section.body, "Status") === "resolved" ? "resolved" : "open",
        answered_by: scalarField(section.body, "Answered by") || null,
      })),
  };
}

function saveQuestionDocument(root: string, document: FeedbackDocument<QuestionEntry>): void {
  writeTextAtomic(
    feedbackPath(root, QUESTIONS_REF),
    renderDocument(document.header, document.entries.map(renderQuestionEntry), EMPTY_QUESTION_MARKER),
  );
}

function loadBlockerDocument(root: string): FeedbackDocument<BlockerEntry> {
  const content = readTextIfExists(feedbackPath(root, BLOCKERS_REF)) ?? BLOCKERS_TEMPLATE;
  const { header, sections } = splitDocument(content);
  return {
    header: header || BLOCKERS_TEMPLATE.trimEnd(),
    entries: sections
      .filter((section) => !isTemplateEntry(section.id))
      .map((section) => ({
        id: section.id,
        scope: scalarField(section.body, "Scope"),
        type: scalarField(section.body, "Type"),
        blocker: scalarField(section.body, "Blocker"),
        required_human_action: scalarField(section.body, "Required human action"),
        prepared_artifacts: listField(section.body, "Prepared artifacts"),
        resume_condition: scalarField(section.body, "Resume condition"),
        status: scalarField(section.body, "Status") === "resolved" ? "resolved" : "open",
        answered_by: scalarField(section.body, "Answered by") || null,
      })),
  };
}

function saveBlockerDocument(root: string, document: FeedbackDocument<BlockerEntry>): void {
  writeTextAtomic(
    feedbackPath(root, BLOCKERS_REF),
    renderDocument(document.header, document.entries.map(renderBlockerEntry), EMPTY_BLOCKER_MARKER),
  );
}

function loadAnswerDocument(root: string): FeedbackDocument<AnswerEntry> {
  const content = readTextIfExists(feedbackPath(root, ANSWERS_REF)) ?? ANSWERS_TEMPLATE;
  const { header, sections } = splitDocument(content);
  return {
    header: header || ANSWERS_TEMPLATE.trimEnd(),
    entries: sections
      .filter((section) => !isTemplateEntry(section.id))
      .map((section) => ({
        id: section.id,
        responds_to: scalarField(section.body, "Responds to"),
        decision: scalarField(section.body, "Decision"),
        reason: scalarField(section.body, "Reason"),
        entered_by: scalarField(section.body, "Entered by"),
        entered_at: scalarField(section.body, "Entered at"),
        status: scalarField(section.body, "Status") === "ingested" ? "ingested" : "pending",
        ingested_at: scalarField(section.body, "Ingested at") || null,
      })),
  };
}

function saveAnswerDocument(root: string, document: FeedbackDocument<AnswerEntry>): void {
  writeTextAtomic(feedbackPath(root, ANSWERS_REF), renderDocument(document.header, document.entries.map(renderAnswerEntry), EMPTY_ANSWER_MARKER));
}

export function createQuestion(root: string, params: CreateQuestionParams): FeedbackWriteResult {
  const path = feedbackPath(root, QUESTIONS_REF);
  const currentContent = readTextIfExists(path) ?? QUESTIONS_TEMPLATE;
  const document = loadQuestionDocument(root);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const id = nextFeedbackId(currentContent, "Q", dateStamp);

  document.entries.push({
    id,
    scope: params.scope,
    severity: params.severity ?? "medium",
    type: params.type ?? "clarification",
    issue: params.issue,
    why_blocked: params.why_blocked,
    options: params.options ?? [],
    recommended_default: params.recommended_default ?? "",
    latest_pause_point: params.latest_pause_point ?? "",
    status: "open",
    answered_by: null,
  });
  saveQuestionDocument(root, document);

  return {
    ref: QUESTIONS_REF,
    id,
    state: maybeTransitionForPause(root, "awaiting_human", `Question ${id} requires human clarification.`, params.scope),
  };
}

export function createBlocker(root: string, params: CreateBlockerParams): FeedbackWriteResult {
  const path = feedbackPath(root, BLOCKERS_REF);
  const currentContent = readTextIfExists(path) ?? BLOCKERS_TEMPLATE;
  const document = loadBlockerDocument(root);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const id = nextFeedbackId(currentContent, "B", dateStamp);

  document.entries.push({
    id,
    scope: params.scope,
    type: params.type ?? "human_action",
    blocker: params.blocker,
    required_human_action: params.required_human_action,
    prepared_artifacts: params.prepared_artifacts ?? [],
    resume_condition: params.resume_condition,
    status: "open",
    answered_by: null,
  });
  saveBlockerDocument(root, document);

  return {
    ref: BLOCKERS_REF,
    id,
    state: loadCurrentState(root),
  };
}

export function createAnswer(root: string, params: CreateAnswerParams): FeedbackWriteResult {
  const path = feedbackPath(root, ANSWERS_REF);
  const currentContent = readTextIfExists(path) ?? ANSWERS_TEMPLATE;
  const document = loadAnswerDocument(root);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const id = nextFeedbackId(currentContent, "A", dateStamp);

  document.entries.push({
    id,
    responds_to: params.responds_to,
    decision: params.decision,
    reason: params.reason,
    entered_by: params.entered_by,
    entered_at: params.entered_at ?? new Date().toISOString(),
    status: "pending",
    ingested_at: null,
  });
  saveAnswerDocument(root, document);

  return {
    ref: ANSWERS_REF,
    id,
    state: loadCurrentState(root),
  };
}

export function ingestAnswers(root: string): FeedbackIngestResult {
  const questions = loadQuestionDocument(root);
  const blockers = loadBlockerDocument(root);
  const answers = loadAnswerDocument(root);
  const processed: FeedbackIngestProcessedEntry[] = [];
  const unmatched: string[] = [];
  const ingestedAt = new Date().toISOString();

  for (const answer of answers.entries) {
    if (answer.status === "ingested") {
      continue;
    }

    const matchingQuestion = questions.entries.find((entry) => entry.id === answer.responds_to);
    if (matchingQuestion && matchingQuestion.status !== "resolved") {
      matchingQuestion.status = "resolved";
      matchingQuestion.answered_by = answer.id;
      answer.status = "ingested";
      answer.ingested_at = ingestedAt;
      processed.push({
        answer_id: answer.id,
        target_id: matchingQuestion.id,
        target_kind: "question",
        scope: matchingQuestion.scope,
      });
      continue;
    }

    const matchingBlocker = blockers.entries.find((entry) => entry.id === answer.responds_to);
    if (matchingBlocker && matchingBlocker.status !== "resolved") {
      matchingBlocker.status = "resolved";
      matchingBlocker.answered_by = answer.id;
      answer.status = "ingested";
      answer.ingested_at = ingestedAt;
      processed.push({
        answer_id: answer.id,
        target_id: matchingBlocker.id,
        target_kind: "blocker",
        scope: matchingBlocker.scope,
      });
      continue;
    }

    unmatched.push(answer.id);
  }

  if (processed.length > 0) {
    saveQuestionDocument(root, questions);
    saveBlockerDocument(root, blockers);
    saveAnswerDocument(root, answers);
  }

  let state = loadCurrentState(root);
  if (processed.length > 0 && (state.phase === "awaiting_human" || state.phase === "blocked")) {
    const unitId = resolveScopedUnitId(processed[0]?.scope) ?? resolveScopedUnitId(state.queue_head);
    state = transitionState(root, "recover", `Ingested ${processed.length} feedback answer(s).`, unitId, "feedback");
  }

  if (processed.length > 0) {
    state = incrementHumanInterventions(root, processed.length);
  }

  return {
    ok: unmatched.length === 0,
    processed,
    unmatched,
    state,
  };
}
