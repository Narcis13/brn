import type { DispatchPacket } from "./types.js";

export function renderDispatchPrompt(packet: DispatchPacket): string {
  return [
    "You are executing one SUPER_CODEX dispatch packet.",
    "Follow the packet exactly and return JSON only.",
    "Update any listed artifacts before you report success.",
    "Return a JSON object with these fields:",
    '- `status`: "success" | "failed" | "blocked" | "interrupted"',
    "- `summary`: concise result summary",
    "- `tests_written`: array of tests added",
    "- `tests_run`: array of tests or checks executed",
    "- `verification_evidence`: array of evidence statements",
    "- `assumptions`: array of assumptions made",
    "- `blockers`: array of blockers encountered",
    "- `followups`: array of follow-up actions",
    "- `skills_used`: optional array of `{ skill_id, outcome, note? }` for repo-local project skills actually used",
    "- `usage`: optional object `{ input_tokens, output_tokens, total_tokens }` when the runtime can provide token usage",
    "",
    "Dispatch packet:",
    JSON.stringify(packet, null, 2),
  ].join("\n");
}

export function renderResumePrompt(packet: DispatchPacket, prompt?: string): string {
  return [
    "Continue the existing SUPER_CODEX runtime session for the same unit.",
    "Return JSON only using the same response schema as before.",
    prompt?.trim() ? `Operator follow-up: ${prompt.trim()}` : "Operator follow-up: Continue and report the current state precisely.",
    "",
    "Original dispatch packet:",
    JSON.stringify(packet, null, 2),
  ].join("\n");
}
