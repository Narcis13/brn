/**
 * SUPER_CLAUDE — Sub-Agent Invocation Engine
 * Context injection, scope guards, output parsing, and reviewer personas.
 *
 * Sub-agents are invoked via Claude Code's Agent tool with isolated context windows.
 * Each agent gets: role header, task context, vault docs, scope guard, output format.
 */

import {
  AGENT_DEFINITIONS,
  PATHS,
  REVIEW_PERSONAS,
  type AgentOutput,
  type AgentRole,
  type AgentDefinition,
  type ContextPayload,
  type ReviewIssue,
  type ReviewPersona,
  type ReviewResult,
  type ReviewSeverity,
} from "./types.ts";

// ─── Agent Definition Lookup ────────────────────────────────────

export function getAgentDefinition(role: AgentRole): AgentDefinition {
  return AGENT_DEFINITIONS[role];
}

// ─── Scope Guards ───────────────────────────────────────────────

const SCOPE_GUARDS: Record<AgentRole, string[]> = {
  architect: [
    "DO NOT write implementation code",
    "DO NOT make task-level plans (that's PLAN_SLICE)",
    "ONLY produce interfaces, contracts, boundary maps, and type signatures",
  ],
  implementer: [
    "ONLY work on files specified in the task plan",
    "ONLY implement behavior specified in must-haves",
    "DO NOT add features beyond the task scope",
    "DO NOT modify files outside the task scope",
  ],
  tester: [
    "ONLY write tests and UAT scripts",
    "DO NOT write implementation code",
    "DO NOT modify existing implementation to make tests pass",
    "If tests reveal a spec gap, flag it — don't fill it yourself",
  ],
  reviewer: [
    "DO NOT modify or change any code — only review and report issues",
    "Categorize every issue as MUST-FIX, SHOULD-FIX, or CONSIDER",
    "Be specific: include file paths and line numbers where possible",
    "Focus on your assigned persona — do not drift into other review areas",
  ],
  researcher: [
    "DO NOT write implementation code",
    "DO NOT make architecture decisions",
    "ONLY research and report compressed, actionable findings",
    "Flag libraries to use (don't hand-roll) and common pitfalls",
  ],
  doctor: [
    "Diagnose BEFORE making any changes — observe, hypothesize, test, conclude",
    "Read error output carefully and check assumptions first",
    "DO NOT immediately start changing code — diagnosis comes first",
    "Propose specific fixes with reasoning",
  ],
  scribe: [
    "DO NOT modify implementation code — only write documentation",
    "Write for future-me (an agent with no memory of this session)",
    "Summaries must be self-contained",
    "Decision records must include reasoning, not just the decision",
  ],
  evolver: [
    "Proposals for critical docs (architecture, core patterns) require human approval",
    "Trace failures to SYSTEM causes — docs, patterns, skills, tests",
    "DO NOT auto-modify critical system docs without flagging for review",
    "Include specific before/after examples in improvement proposals",
  ],
};

export function buildScopeGuard(role: AgentRole): string[] {
  return SCOPE_GUARDS[role];
}

// ─── Vault Doc Loading ──────────────────────────────────────────

export async function getVaultDocsForAgent(
  projectRoot: string,
  role: AgentRole
): Promise<string[]> {
  const definition = AGENT_DEFINITIONS[role];
  const docs: string[] = [];

  for (const accessDir of definition.vaultAccess) {
    const dir = `${projectRoot}/${PATHS.vault}/${accessDir}`;
    try {
      const glob = new Bun.Glob("*.md");
      for await (const path of glob.scan({ cwd: dir })) {
        const filePath = `${dir}${path}`;
        const file = Bun.file(filePath);
        if (await file.exists()) {
          const content = await file.text();
          docs.push(content);
        }
      }
    } catch {
      // Directory may not exist
    }
  }

  return docs;
}

// ─── Agent Prompt Building ──────────────────────────────────────

export function buildAgentPrompt(
  role: AgentRole,
  context: ContextPayload,
  additionalInstructions: string[]
): string {
  const definition = AGENT_DEFINITIONS[role];
  const scopeGuard = SCOPE_GUARDS[role];

  const sections: string[] = [];

  // Role header
  sections.push(`# ${capitalize(role)} Agent`);
  sections.push(`**Role:** ${definition.description}`);
  sections.push("");

  // Task context
  if (context.taskPlan) {
    sections.push(`## Context`);
    sections.push(context.taskPlan);
    sections.push("");
  }

  // Code files
  if (Object.keys(context.codeFiles).length > 0) {
    sections.push(`## Code Files`);
    for (const [path, content] of Object.entries(context.codeFiles)) {
      sections.push(`### ${path}`);
      sections.push("```typescript");
      sections.push(content);
      sections.push("```");
      sections.push("");
    }
  }

  // Upstream summaries
  if (context.upstreamSummaries.length > 0) {
    sections.push(`## Upstream Summaries`);
    for (const summary of context.upstreamSummaries) {
      sections.push(summary);
      sections.push("");
    }
  }

  // Vault docs
  if (context.vaultDocs.length > 0) {
    sections.push(`## Reference Docs`);
    for (const doc of context.vaultDocs) {
      sections.push(doc);
      sections.push("");
    }
  }

  // Boundary contracts
  if (context.boundaryContracts.length > 0) {
    sections.push(`## Boundary Contracts`);
    for (const contract of context.boundaryContracts) {
      sections.push(contract);
      sections.push("");
    }
  }

  // Additional instructions
  if (additionalInstructions.length > 0) {
    sections.push(`## Additional Instructions`);
    for (const instruction of additionalInstructions) {
      sections.push(`- ${instruction}`);
    }
    sections.push("");
  }

  // Scope guard (at the end for high attention)
  sections.push(`## Scope Guard`);
  for (const guard of scopeGuard) {
    sections.push(`- ${guard}`);
  }

  return sections.join("\n");
}

// ─── Agent Output Parsing ───────────────────────────────────────

export function parseAgentOutput(agent: AgentRole, raw: string): AgentOutput {
  if (!raw || raw.trim().length === 0) {
    return {
      agent,
      success: false,
      content: "",
      issues: [],
    };
  }

  // Check frontmatter for status
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  let status = "success";

  if (fmMatch?.[1]) {
    const lines = fmMatch[1].split("\n");
    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (key === "status") {
        status = value;
      }
    }
  }

  // Extract body content (after frontmatter or entire text if no frontmatter)
  const body = fmMatch ? raw.slice(raw.indexOf("---", 3) + 4).trim() : raw.trim();

  return {
    agent,
    success: status !== "error",
    content: body,
    issues: [],
  };
}

// ─── Review Prompt Building ─────────────────────────────────────

const PERSONA_FOCUS: Record<ReviewPersona, string> = {
  correctness: `Focus on:
- Does the code do what the spec says?
- Are edge cases handled? Empty inputs, null values, boundaries?
- Is error handling correct and complete?
- Are there off-by-one errors or incorrect conditions?
- Does the logic match the must-haves?`,

  architecture: `Focus on:
- Does the code fit the system design and established patterns?
- Are abstraction levels appropriate? Not too many, not too few.
- Is the dependency direction correct (no circular, no wrong-layer imports)?
- Are responsibilities correctly separated?
- Would this design scale to the next known requirement?`,

  typescript: `Focus on:
- Are types correct and precise? No \`any\` types?
- Is strict mode satisfied? Proper null checks?
- Are generics used appropriately (not over-engineered)?
- Are type assertions (\`as\`) justified or hiding bugs?
- Are return types explicit where they should be?`,

  performance: `Focus on:
- Are there N+1 query patterns or unnecessary database calls?
- Are there unnecessary re-renders in React components?
- Are there memory leaks (uncleared timers, subscriptions, closures)?
- Is there unnecessary data copying or transformation?
- Would this cause problems at 10x the current scale?`,

  security: `Focus on:
- Is there SQL injection, XSS, or command injection risk?
- Are auth/authz checks correct and complete?
- Are secrets or credentials exposed (hardcoded, logged, or in URLs)?
- Is user input validated and sanitized at boundaries?
- Are OWASP Top 10 vulnerabilities addressed?`,

  testability: `Focus on:
- Are tests testing behavior or implementation details?
- Are there coverage gaps in happy path, edge cases, or error cases?
- Are there flaky test risks (timing, order-dependency, shared state)?
- Do test names read like specifications?
- Are mocks/stubs appropriate or hiding real integration issues?`,
};

export function buildReviewPrompt(
  persona: ReviewPersona,
  context: ContextPayload
): string {
  const focus = PERSONA_FOCUS[persona];

  const sections: string[] = [];

  sections.push(`# ${capitalize(persona)} Review`);
  sections.push("");
  sections.push(`You are reviewing code from the **${persona}** perspective.`);
  sections.push("");

  // Focus areas
  sections.push(`## Review Focus`);
  sections.push(focus);
  sections.push("");

  // Code to review
  if (Object.keys(context.codeFiles).length > 0) {
    sections.push(`## Code to Review`);
    for (const [path, content] of Object.entries(context.codeFiles)) {
      sections.push(`### ${path}`);
      sections.push("```typescript");
      sections.push(content);
      sections.push("```");
      sections.push("");
    }
  }

  // Task context
  if (context.taskPlan) {
    sections.push(`## Task Context`);
    sections.push(context.taskPlan);
    sections.push("");
  }

  // Vault docs
  if (context.vaultDocs.length > 0) {
    sections.push(`## Reference Docs`);
    for (const doc of context.vaultDocs) {
      sections.push(doc);
      sections.push("");
    }
  }

  // Output format
  sections.push(`## Output Format`);
  sections.push(`Respond with exactly this structure:`);
  sections.push("");
  sections.push("```markdown");
  sections.push(`## ${capitalize(persona)} Review`);
  sections.push("");
  sections.push("### Issues");
  sections.push("");
  sections.push("**MUST-FIX** | file:line | Description of critical issue");
  sections.push("Suggestion: How to fix it");
  sections.push("");
  sections.push("**SHOULD-FIX** | file:line | Description of quality issue");
  sections.push("Suggestion: How to fix it");
  sections.push("");
  sections.push("**CONSIDER** | file:line | Description of optional improvement");
  sections.push("Suggestion: How to improve it");
  sections.push("");
  sections.push("### Summary");
  sections.push("[2-3 sentence overall assessment]");
  sections.push("```");
  sections.push("");
  sections.push("If there are no issues, write 'None found.' under ### Issues.");

  // Scope guard
  sections.push("");
  sections.push("## Scope Guard");
  sections.push("- DO NOT modify or change any code — only review and report issues");
  sections.push("- Categorize every issue as MUST-FIX, SHOULD-FIX, or CONSIDER");
  sections.push("- Be specific: include file paths and line numbers where possible");

  return sections.join("\n");
}

// ─── Review Output Parsing ──────────────────────────────────────

export function parseReviewOutput(
  persona: ReviewPersona,
  raw: string
): ReviewResult {
  const issues: ReviewIssue[] = [];

  // Parse issues: **SEVERITY** | file:line | description
  const issuePattern = /\*\*(MUST-FIX|SHOULD-FIX|CONSIDER)\*\*\s*\|\s*([^|]+)\|\s*(.+)/g;
  let match: RegExpExecArray | null;

  while ((match = issuePattern.exec(raw)) !== null) {
    const severity = match[1] as ReviewSeverity;
    const location = match[2]!.trim();
    const description = match[3]!.trim();

    // Parse file:line from location
    let file: string | null = null;
    let line: number | null = null;

    if (location && location !== "General") {
      const fileLineMatch = location.match(/^(.+):(\d+)$/);
      if (fileLineMatch?.[1] && fileLineMatch[2]) {
        file = fileLineMatch[1];
        line = parseInt(fileLineMatch[2], 10);
      }
    }

    // Look for suggestion on the next line
    const afterIssue = raw.slice((match.index ?? 0) + match[0].length);
    const suggestionMatch = afterIssue.match(/^\s*\n\s*Suggestion:\s*(.+)/);
    const suggestion = suggestionMatch?.[1]?.trim() ?? null;

    issues.push({
      persona,
      severity,
      description,
      file,
      line,
      suggestion,
    });
  }

  // Parse summary
  const summaryMatch = raw.match(/### Summary\s*\n([\s\S]*?)(?:\n##|$)/);
  const summary = summaryMatch?.[1]?.trim() ?? "";

  return {
    persona,
    issues,
    summary,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
