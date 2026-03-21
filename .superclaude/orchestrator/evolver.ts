/**
 * SUPER_CLAUDE — Evolver Agent Workflow
 * Analyze failures → propose fixes → human review → apply.
 * Per spec §12.3-12.4: System self-improvement through postmortem analysis.
 */

import type {
  EvolverProposal,
  EvolverResult,
  PostmortemFix,
  PostmortemReport,
  ProposalStatus,
} from "./types.ts";
import { PATHS } from "./types.ts";
import { loadPostmortem } from "./postmortem.ts";

// ─── Proposal Creation ──────────────────────────────────────────

export function createProposal(
  id: string,
  postmortemId: string,
  fix: PostmortemFix
): EvolverProposal {
  return {
    id,
    postmortemId,
    timestamp: new Date().toISOString(),
    fix,
    status: "pending",
    reviewNotes: null,
    appliedAt: null,
  };
}

// ─── Persistence ────────────────────────────────────────────────

function proposalDir(projectRoot: string): string {
  return `${projectRoot}/${PATHS.history}/proposals`;
}

function proposalPath(projectRoot: string, id: string): string {
  return `${proposalDir(projectRoot)}/${id}.json`;
}

export async function writeProposal(
  projectRoot: string,
  proposal: EvolverProposal
): Promise<void> {
  const dir = proposalDir(projectRoot);
  await Bun.$`mkdir -p ${dir}`.quiet();
  await Bun.write(proposalPath(projectRoot, proposal.id), JSON.stringify(proposal, null, 2));
}

export async function loadProposal(
  projectRoot: string,
  id: string
): Promise<EvolverProposal | null> {
  const path = proposalPath(projectRoot, id);
  const file = Bun.file(path);

  if (!(await file.exists())) return null;

  const content = await file.text();
  return JSON.parse(content) as EvolverProposal;
}

export async function listProposals(projectRoot: string): Promise<string[]> {
  const dir = proposalDir(projectRoot);
  const glob = new Bun.Glob("EVO-*.json");
  const ids: string[] = [];

  for await (const entry of glob.scan({ cwd: dir })) {
    ids.push(entry.replace(".json", ""));
  }

  return ids.sort();
}

// ─── Review Workflow ────────────────────────────────────────────

export async function approveProposal(
  projectRoot: string,
  id: string,
  notes: string
): Promise<void> {
  const proposal = await loadProposal(projectRoot, id);
  if (!proposal) return;

  proposal.status = "approved";
  proposal.reviewNotes = notes;
  await writeProposal(projectRoot, proposal);
}

export async function rejectProposal(
  projectRoot: string,
  id: string,
  notes: string
): Promise<void> {
  const proposal = await loadProposal(projectRoot, id);
  if (!proposal) return;

  proposal.status = "rejected";
  proposal.reviewNotes = notes;
  await writeProposal(projectRoot, proposal);
}

// ─── Apply Proposal ─────────────────────────────────────────────

export async function applyProposal(
  projectRoot: string,
  id: string
): Promise<boolean> {
  const proposal = await loadProposal(projectRoot, id);
  if (!proposal) return false;

  // Only apply approved proposals
  if (proposal.status !== "approved") return false;

  const success = await applyFix(projectRoot, proposal.fix);
  if (!success) return false;

  proposal.status = "applied";
  proposal.appliedAt = new Date().toISOString();
  await writeProposal(projectRoot, proposal);

  return true;
}

async function applyFix(projectRoot: string, fix: PostmortemFix): Promise<boolean> {
  const targetPath = `${projectRoot}/.superclaude/${fix.target}`;

  switch (fix.type) {
    case "vault-doc": {
      // Ensure parent directory exists
      const dir = targetPath.slice(0, targetPath.lastIndexOf("/"));
      await Bun.$`mkdir -p ${dir}`.quiet();

      const content = generateVaultDoc(fix);
      await Bun.write(targetPath, content);
      return true;
    }

    case "test-pattern": {
      const dir = targetPath.slice(0, targetPath.lastIndexOf("/"));
      await Bun.$`mkdir -p ${dir}`.quiet();

      const content = generateTestPatternDoc(fix);
      await Bun.write(targetPath, content);
      return true;
    }

    case "skill-instruction": {
      // Skill instruction changes are sensitive — write as a proposal note
      // The actual change requires manual review
      const notePath = `${projectRoot}/.superclaude/history/proposals/${fix.target.replace(/\//g, "-")}-proposal.md`;
      const dir = `${projectRoot}/.superclaude/history/proposals`;
      await Bun.$`mkdir -p ${dir}`.quiet();

      const content = [
        "---",
        `type: skill-instruction-proposal`,
        `target: ${fix.target}`,
        `created: ${new Date().toISOString()}`,
        "---",
        "",
        `## Proposed Change`,
        fix.description,
        "",
        `## Reason`,
        fix.reason,
        "",
        fix.before ? `## Before\n${fix.before}\n` : "",
        fix.after ? `## After\n${fix.after}\n` : "",
      ].join("\n");

      await Bun.write(notePath, content);
      return true;
    }

    case "verification-check": {
      // Verification check changes require code modification
      // Write as a proposal note for manual implementation
      const notePath = `${projectRoot}/.superclaude/history/proposals/verify-${Date.now()}-proposal.md`;
      const dir = `${projectRoot}/.superclaude/history/proposals`;
      await Bun.$`mkdir -p ${dir}`.quiet();

      const content = [
        "---",
        `type: verification-check-proposal`,
        `target: ${fix.target}`,
        `created: ${new Date().toISOString()}`,
        "---",
        "",
        `## Proposed Verification Check`,
        fix.description,
        "",
        `## Reason`,
        fix.reason,
        "",
      ].join("\n");

      await Bun.write(notePath, content);
      return true;
    }
  }
}

function generateVaultDoc(fix: PostmortemFix): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: ${fix.description}`);
  lines.push(`type: learning`);
  lines.push(`created: ${new Date().toISOString()}`);
  lines.push(`updated_by: agent:evolver`);
  lines.push("---");
  lines.push("");
  lines.push("## Summary");
  lines.push(fix.description);
  lines.push("");
  lines.push("## Content");
  lines.push(fix.after ?? fix.description);
  lines.push("");
  lines.push("## Reason");
  lines.push(fix.reason);
  lines.push("");
  return lines.join("\n");
}

function generateTestPatternDoc(fix: PostmortemFix): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: ${fix.description}`);
  lines.push(`type: testing`);
  lines.push(`created: ${new Date().toISOString()}`);
  lines.push(`updated_by: agent:evolver`);
  lines.push("---");
  lines.push("");
  lines.push("## Summary");
  lines.push(fix.description);
  lines.push("");
  lines.push("## Pattern");
  lines.push(fix.after ?? fix.description);
  lines.push("");
  lines.push("## Reason");
  lines.push(fix.reason);
  lines.push("");
  return lines.join("\n");
}

// ─── Postmortem Analysis ────────────────────────────────────────

/**
 * Given a postmortem ID, generate EvolverProposals for each proposed fix.
 * This is the bridge between postmortem → evolver workflow.
 */
export async function runPostmortemAnalysis(
  projectRoot: string,
  postmortemId: string
): Promise<EvolverProposal[]> {
  const pm = await loadPostmortem(projectRoot, postmortemId);
  if (!pm) return [];

  const proposals: EvolverProposal[] = [];
  let counter = 1;

  for (const fix of pm.proposedFixes) {
    const proposalId = `EVO-${postmortemId.replace("PM-", "")}-${String(counter).padStart(2, "0")}`;
    const proposal = createProposal(proposalId, postmortemId, fix);

    await writeProposal(projectRoot, proposal);
    proposals.push(proposal);
    counter++;
  }

  return proposals;
}

// ─── Evolver Report ─────────────────────────────────────────────

export function generateEvolverReport(result: EvolverResult): string {
  const lines: string[] = [];

  lines.push("## Evolver Report");
  lines.push("");
  lines.push(`- Proposals Generated: ${result.proposalsGenerated}`);
  lines.push(`- Proposals Applied: ${result.proposalsApplied}`);
  lines.push("");

  if (result.vaultDocsUpdated.length > 0) {
    lines.push("### Vault Docs Updated");
    for (const doc of result.vaultDocsUpdated) {
      lines.push(`- ${doc}`);
    }
    lines.push("");
  }

  if (result.skillsUpdated.length > 0) {
    lines.push("### Skills Updated");
    for (const skill of result.skillsUpdated) {
      lines.push(`- ${skill}`);
    }
    lines.push("");
  }

  if (result.newLearnings.length > 0) {
    lines.push("### New Learnings");
    for (const learning of result.newLearnings) {
      lines.push(`- ${learning}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
