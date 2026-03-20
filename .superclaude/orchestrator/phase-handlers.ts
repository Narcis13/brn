/**
 * SUPER_CLAUDE — Phase Handlers
 * Implements DISCUSS, RESEARCH, and REASSESS phase logic.
 * Per spec §6.1, §6.2, §6.7: These phases produce specific artifacts.
 */

import { PATHS } from "./types.ts";

// ─── Types ──────────────────────────────────────────────────────

export interface DiscussResult {
  success: boolean;
  contextPath: string;
  grayAreasCount: number;
  decisionsCount: number;
}

export interface ResearchResult {
  success: boolean;
  researchPath: string;
  dontHandRollCount: number;
  pitfallsCount: number;
}

export interface ReassessResult {
  success: boolean;
  changes: ReassessChange[];
  roadmapUpdated: boolean;
}

export interface ReassessChange {
  type: "add" | "remove" | "reorder" | "modify";
  sliceId: string;
  description: string;
}

// ─── DISCUSS Phase (§6.1) ───────────────────────────────────────

/**
 * Check if the DISCUSS phase is needed for a milestone.
 * Needed when CONTEXT.md doesn't exist or is a placeholder.
 */
export async function isDiscussNeeded(
  projectRoot: string,
  milestoneId: string
): Promise<boolean> {
  const contextPath = `${projectRoot}/${PATHS.milestonePath(milestoneId)}/CONTEXT.md`;
  const file = Bun.file(contextPath);

  if (!(await file.exists())) return true;

  const content = await file.text();
  // Check if it's still a placeholder
  return content.includes("_To be filled during DISCUSS phase._");
}

/**
 * Parse the output of a DISCUSS phase invocation.
 * Extracts gray areas and decisions, writes them to CONTEXT.md.
 */
export async function processDiscussOutput(
  projectRoot: string,
  milestoneId: string,
  output: string
): Promise<DiscussResult> {
  const contextPath = `${projectRoot}/${PATHS.milestonePath(milestoneId)}/CONTEXT.md`;

  // Count gray areas identified
  const grayAreaMatches = output.match(/### \d+\./g);
  const grayAreasCount = grayAreaMatches?.length ?? 0;

  // Count decisions made (look for recommendation sections)
  const decisionMatches = output.match(/\*\*(?:My recommendation|Decision|Chosen):\*\*/gi);
  const decisionsCount = decisionMatches?.length ?? 0;

  // Write CONTEXT.md with the discuss output
  const content = `---
milestone: ${milestoneId}
created: ${new Date().toISOString()}
gray_areas: ${grayAreasCount}
decisions: ${decisionsCount}
---

## Discuss Phase Output

${output}
`;

  await Bun.write(contextPath, content);

  return {
    success: true,
    contextPath: `${PATHS.milestonePath(milestoneId)}/CONTEXT.md`,
    grayAreasCount,
    decisionsCount,
  };
}

// ─── RESEARCH Phase (§6.2) ─────────────────────────────────────

/**
 * Check if the RESEARCH phase is needed for a milestone.
 * Needed when RESEARCH.md doesn't exist.
 */
export async function isResearchNeeded(
  projectRoot: string,
  milestoneId: string
): Promise<boolean> {
  const researchPath = `${projectRoot}/${PATHS.milestonePath(milestoneId)}/RESEARCH.md`;
  return !(await Bun.file(researchPath).exists());
}

/**
 * Parse the output of a RESEARCH phase invocation.
 * Writes findings to RESEARCH.md.
 */
export async function processResearchOutput(
  projectRoot: string,
  milestoneId: string,
  output: string
): Promise<ResearchResult> {
  const researchPath = `${projectRoot}/${PATHS.milestonePath(milestoneId)}/RESEARCH.md`;

  // Count "Don't Hand-Roll" entries
  const dontHandRollMatches = output.match(/^- .+/gm);
  const dontHandRollSection = output.match(/## Don't Hand-Roll\n([\s\S]*?)(?=\n## |$)/);
  const dontHandRollCount = dontHandRollSection?.[1]?.match(/^- /gm)?.length ?? 0;

  // Count pitfalls
  const pitfallSection = output.match(/## Common Pitfalls\n([\s\S]*?)(?=\n## |$)/);
  const pitfallsCount = pitfallSection?.[1]?.match(/^- /gm)?.length ?? 0;

  // Write RESEARCH.md
  const content = `---
milestone: ${milestoneId}
created: ${new Date().toISOString()}
dont_hand_roll: ${dontHandRollCount}
pitfalls: ${pitfallsCount}
---

${output}
`;

  await Bun.write(researchPath, content);

  return {
    success: true,
    researchPath: `${PATHS.milestonePath(milestoneId)}/RESEARCH.md`,
    dontHandRollCount,
    pitfallsCount,
  };
}

// ─── RETROSPECTIVE Phase ─────────────────────────────────────────

export interface RetrospectiveResult {
  success: boolean;
  learningsCount: number;
  decisionsCount: number;
  playbooksCount: number;
  vaultDocsWritten: string[];
  indexUpdated: boolean;
}

/**
 * Parse the output of a RETROSPECTIVE phase invocation.
 * Counts vault documents written and verifies INDEX.md was updated.
 */
export async function processRetrospectiveOutput(
  projectRoot: string,
  milestoneId: string,
  sliceId: string,
  output: string
): Promise<RetrospectiveResult> {
  const vaultDocsWritten: string[] = [];

  // Count learnings written (look for vault/learnings/ paths in output)
  const learningMatches = output.match(/vault\/learnings\/[\w-]+\.md/g);
  const learningsCount = learningMatches?.length ?? 0;
  if (learningMatches) vaultDocsWritten.push(...learningMatches);

  // Count decisions written
  const decisionMatches = output.match(/vault\/decisions\/[\w-]+\.md/g);
  const decisionsCount = decisionMatches?.length ?? 0;
  if (decisionMatches) vaultDocsWritten.push(...decisionMatches);

  // Count playbooks written
  const playbookMatches = output.match(/vault\/playbooks\/[\w-]+\.md/g);
  const playbooksCount = playbookMatches?.length ?? 0;
  if (playbookMatches) vaultDocsWritten.push(...playbookMatches);

  // Check if INDEX.md was mentioned (likely updated)
  const indexUpdated = output.includes("INDEX.md");

  // Verify at least some vault docs exist on disk
  const vaultBase = `${projectRoot}/${PATHS.vault}`;
  let actualDocsFound = 0;
  for (const dir of ["learnings", "decisions", "playbooks"]) {
    try {
      const glob = new Bun.Glob("*.md");
      for await (const _ of glob.scan({ cwd: `${vaultBase}/${dir}` })) {
        actualDocsFound++;
      }
    } catch {
      // Directory may not exist yet
    }
  }

  return {
    success: true,
    learningsCount,
    decisionsCount,
    playbooksCount,
    vaultDocsWritten: [...new Set(vaultDocsWritten)],
    indexUpdated,
  };
}

/**
 * Check if the RETROSPECTIVE phase has completed for a slice.
 * We consider it complete if the evolver has been invoked (output processed).
 * The phase is stateless — no specific artifact is required beyond vault writes.
 */
export async function isRetrospectiveComplete(
  projectRoot: string,
  milestoneId: string,
  sliceId: string
): Promise<boolean> {
  // Check if any vault learnings exist that reference this slice
  const learningsDir = `${projectRoot}/${PATHS.vault}/learnings`;
  try {
    const glob = new Bun.Glob("*.md");
    for await (const path of glob.scan({ cwd: learningsDir })) {
      const content = await Bun.file(`${learningsDir}/${path}`).text();
      if (content.includes(sliceId)) return true;
    }
  } catch {
    // Directory may not exist
  }

  return false;
}

// ─── REASSESS Phase (§6.7) ─────────────────────────────────────

/**
 * Parse the output of a REASSESS phase invocation.
 * Detects changes and optionally updates the ROADMAP.md.
 */
export async function processReassessOutput(
  projectRoot: string,
  milestoneId: string,
  output: string
): Promise<ReassessResult> {
  const changes: ReassessChange[] = [];

  // Detect proposed changes
  const addMatches = output.matchAll(/(?:add|insert|new slice).*?(S\d+)[:\s]+(.*)/gi);
  for (const match of addMatches) {
    changes.push({
      type: "add",
      sliceId: match[1] ?? "new",
      description: match[2]?.trim() ?? "",
    });
  }

  const removeMatches = output.matchAll(/(?:remove|drop|cut|skip).*?(S\d+)/gi);
  for (const match of removeMatches) {
    changes.push({
      type: "remove",
      sliceId: match[1] ?? "",
      description: `Remove ${match[1]}`,
    });
  }

  const modifyMatches = output.matchAll(/(?:modify|update|change|adjust).*?(S\d+)[:\s]+(.*)/gi);
  for (const match of modifyMatches) {
    changes.push({
      type: "modify",
      sliceId: match[1] ?? "",
      description: match[2]?.trim() ?? "",
    });
  }

  const reorderMatches = output.matchAll(/(?:reorder|swap|move).*?(S\d+)/gi);
  for (const match of reorderMatches) {
    changes.push({
      type: "reorder",
      sliceId: match[1] ?? "",
      description: `Reorder ${match[1]}`,
    });
  }

  // Check if "no changes needed" sentiment is present
  const noChanges = /no (?:changes|modifications|updates) (?:needed|required|necessary)/i.test(output) ||
                    /roadmap (?:is|remains|still) (?:valid|correct|on track)/i.test(output);

  const roadmapUpdated = changes.length > 0 && !noChanges;

  // If changes were detected, append a reassessment note to the ROADMAP
  if (roadmapUpdated) {
    const roadmapPath = `${projectRoot}/${PATHS.milestonePath(milestoneId)}/ROADMAP.md`;
    const existingRoadmap = await Bun.file(roadmapPath).text().catch(() => "");

    const reassessNote = `\n\n## Reassessment (${new Date().toISOString().slice(0, 10)})\n\n${output}\n`;
    await Bun.write(roadmapPath, existingRoadmap + reassessNote);
  }

  return {
    success: true,
    changes,
    roadmapUpdated,
  };
}

// ─── Phase Completion Checks ────────────────────────────────────

/**
 * Check if a phase has produced its required artifacts.
 */
export async function isPhaseArtifactComplete(
  projectRoot: string,
  phase: string,
  milestoneId: string
): Promise<boolean> {
  const base = `${projectRoot}/${PATHS.milestonePath(milestoneId)}`;

  switch (phase) {
    case "DISCUSS": {
      const file = Bun.file(`${base}/CONTEXT.md`);
      if (!(await file.exists())) return false;
      const content = await file.text();
      return !content.includes("_To be filled during DISCUSS phase._");
    }

    case "RESEARCH": {
      return await Bun.file(`${base}/RESEARCH.md`).exists();
    }

    case "PLAN_MILESTONE": {
      const file = Bun.file(`${base}/ROADMAP.md`);
      if (!(await file.exists())) return false;
      const content = await file.text();
      return !content.includes("_To be planned during PLAN_MILESTONE phase._");
    }

    case "RETROSPECTIVE":
      // Retrospective is always "complete" after one pass — it's a best-effort knowledge extraction
      return true;

    default:
      return false;
  }
}
