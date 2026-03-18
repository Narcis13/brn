import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isDiscussNeeded,
  isResearchNeeded,
  isPhaseArtifactComplete,
  processDiscussOutput,
  processResearchOutput,
  processReassessOutput,
} from "./phase-handlers.ts";

let projectRoot: string;
const milestoneId = "M001";

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "phase-handlers-"));
  // Create milestone directory
  await Bun.$`mkdir -p ${projectRoot}/.superclaude/state/milestones/${milestoneId}`;
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

// ─── isDiscussNeeded ──────────────────────────────────────────

test("isDiscussNeeded returns true when CONTEXT.md does not exist", async () => {
  expect(await isDiscussNeeded(projectRoot, milestoneId)).toBe(true);
});

test("isDiscussNeeded returns true when CONTEXT.md is a placeholder", async () => {
  const path = `${projectRoot}/.superclaude/state/milestones/${milestoneId}/CONTEXT.md`;
  await Bun.write(path, "_To be filled during DISCUSS phase._");
  expect(await isDiscussNeeded(projectRoot, milestoneId)).toBe(true);
});

test("isDiscussNeeded returns false when CONTEXT.md has real content", async () => {
  const path = `${projectRoot}/.superclaude/state/milestones/${milestoneId}/CONTEXT.md`;
  await Bun.write(path, "## Discuss Phase Output\n\nReal decisions here.");
  expect(await isDiscussNeeded(projectRoot, milestoneId)).toBe(false);
});

// ─── isResearchNeeded ─────────────────────────────────────────

test("isResearchNeeded returns true when RESEARCH.md does not exist", async () => {
  expect(await isResearchNeeded(projectRoot, milestoneId)).toBe(true);
});

test("isResearchNeeded returns false when RESEARCH.md exists", async () => {
  const path = `${projectRoot}/.superclaude/state/milestones/${milestoneId}/RESEARCH.md`;
  await Bun.write(path, "## Research findings");
  expect(await isResearchNeeded(projectRoot, milestoneId)).toBe(false);
});

// ─── processDiscussOutput ─────────────────────────────────────

test("processDiscussOutput writes CONTEXT.md and counts gray areas", async () => {
  const output = `### 1. Should we use REST or gRPC?
**My recommendation:** REST for simplicity.

### 2. Monorepo or polyrepo?
**Decision:** Monorepo.

### 3. Auth strategy?
**Chosen:** OAuth2 + JWT.`;

  const result = await processDiscussOutput(projectRoot, milestoneId, output);
  expect(result.success).toBe(true);
  expect(result.grayAreasCount).toBe(3);
  expect(result.decisionsCount).toBe(3);
  expect(result.contextPath).toContain("CONTEXT.md");

  // Verify file was written
  const content = await Bun.file(
    `${projectRoot}/.superclaude/state/milestones/${milestoneId}/CONTEXT.md`
  ).text();
  expect(content).toContain("milestone: M001");
  expect(content).toContain("gray_areas: 3");
  expect(content).toContain("Should we use REST or gRPC");
});

test("processDiscussOutput handles output with no gray areas", async () => {
  const output = "Everything looks good, no ambiguity found.";
  const result = await processDiscussOutput(projectRoot, milestoneId, output);
  expect(result.grayAreasCount).toBe(0);
  expect(result.decisionsCount).toBe(0);
  expect(result.success).toBe(true);
});

// ─── processResearchOutput ────────────────────────────────────

test("processResearchOutput writes RESEARCH.md and counts entries", async () => {
  const output = `## Don't Hand-Roll
- JWT validation — use jose
- Rate limiting — use @fastify/rate-limit
- Schema validation — use zod

## Common Pitfalls
- Forgetting to invalidate refresh tokens
- Not setting proper CORS headers`;

  const result = await processResearchOutput(projectRoot, milestoneId, output);
  expect(result.success).toBe(true);
  expect(result.dontHandRollCount).toBe(3);
  expect(result.pitfallsCount).toBe(2);
  expect(result.researchPath).toContain("RESEARCH.md");

  const content = await Bun.file(
    `${projectRoot}/.superclaude/state/milestones/${milestoneId}/RESEARCH.md`
  ).text();
  expect(content).toContain("milestone: M001");
  expect(content).toContain("dont_hand_roll: 3");
});

test("processResearchOutput handles output with no sections", async () => {
  const output = "No specific libraries needed for this milestone.";
  const result = await processResearchOutput(projectRoot, milestoneId, output);
  expect(result.dontHandRollCount).toBe(0);
  expect(result.pitfallsCount).toBe(0);
  expect(result.success).toBe(true);
});

// ─── processReassessOutput ────────────────────────────────────

test("processReassessOutput detects add changes", async () => {
  // Pre-create ROADMAP.md so the append works
  const roadmapPath = `${projectRoot}/.superclaude/state/milestones/${milestoneId}/ROADMAP.md`;
  await Bun.write(roadmapPath, "# Roadmap\n");

  const output = "After review, add new slice S05: Implement caching layer";
  const result = await processReassessOutput(projectRoot, milestoneId, output);
  expect(result.success).toBe(true);
  expect(result.changes.length).toBeGreaterThanOrEqual(1);
  expect(result.changes.some((c) => c.type === "add")).toBe(true);
  expect(result.roadmapUpdated).toBe(true);
});

test("processReassessOutput detects remove changes", async () => {
  const roadmapPath = `${projectRoot}/.superclaude/state/milestones/${milestoneId}/ROADMAP.md`;
  await Bun.write(roadmapPath, "# Roadmap\n");

  const output = "We should remove S03 as it's no longer needed.";
  const result = await processReassessOutput(projectRoot, milestoneId, output);
  expect(result.changes.some((c) => c.type === "remove" && c.sliceId === "S03")).toBe(true);
  expect(result.roadmapUpdated).toBe(true);
});

test("processReassessOutput detects modify changes", async () => {
  const roadmapPath = `${projectRoot}/.superclaude/state/milestones/${milestoneId}/ROADMAP.md`;
  await Bun.write(roadmapPath, "# Roadmap\n");

  const output = "We need to modify S02: Expand scope to include validation";
  const result = await processReassessOutput(projectRoot, milestoneId, output);
  expect(result.changes.some((c) => c.type === "modify" && c.sliceId === "S02")).toBe(true);
});

test("processReassessOutput detects reorder changes", async () => {
  const roadmapPath = `${projectRoot}/.superclaude/state/milestones/${milestoneId}/ROADMAP.md`;
  await Bun.write(roadmapPath, "# Roadmap\n");

  const output = "We should reorder S04 to come before S02.";
  const result = await processReassessOutput(projectRoot, milestoneId, output);
  expect(result.changes.some((c) => c.type === "reorder" && c.sliceId === "S04")).toBe(true);
});

test("processReassessOutput detects no changes needed", async () => {
  const output = "The roadmap remains valid and on track. No changes needed.";
  const result = await processReassessOutput(projectRoot, milestoneId, output);
  expect(result.changes.length).toBe(0);
  expect(result.roadmapUpdated).toBe(false);
});

test("processReassessOutput appends reassessment note to ROADMAP.md", async () => {
  const roadmapPath = `${projectRoot}/.superclaude/state/milestones/${milestoneId}/ROADMAP.md`;
  await Bun.write(roadmapPath, "# Roadmap\n\n## S01\n");

  const output = "Add new slice S05: Performance testing";
  await processReassessOutput(projectRoot, milestoneId, output);

  const content = await Bun.file(roadmapPath).text();
  expect(content).toContain("## Reassessment");
  expect(content).toContain("Performance testing");
  // Original content preserved
  expect(content).toContain("# Roadmap");
});

// ─── isPhaseArtifactComplete ──────────────────────────────────

test("isPhaseArtifactComplete DISCUSS: false when no CONTEXT.md", async () => {
  expect(await isPhaseArtifactComplete(projectRoot, "DISCUSS", milestoneId)).toBe(false);
});

test("isPhaseArtifactComplete DISCUSS: false when placeholder", async () => {
  const path = `${projectRoot}/.superclaude/state/milestones/${milestoneId}/CONTEXT.md`;
  await Bun.write(path, "_To be filled during DISCUSS phase._");
  expect(await isPhaseArtifactComplete(projectRoot, "DISCUSS", milestoneId)).toBe(false);
});

test("isPhaseArtifactComplete DISCUSS: true when filled", async () => {
  const path = `${projectRoot}/.superclaude/state/milestones/${milestoneId}/CONTEXT.md`;
  await Bun.write(path, "## Decisions\nWe chose REST.");
  expect(await isPhaseArtifactComplete(projectRoot, "DISCUSS", milestoneId)).toBe(true);
});

test("isPhaseArtifactComplete RESEARCH: false when no file", async () => {
  expect(await isPhaseArtifactComplete(projectRoot, "RESEARCH", milestoneId)).toBe(false);
});

test("isPhaseArtifactComplete RESEARCH: true when file exists", async () => {
  const path = `${projectRoot}/.superclaude/state/milestones/${milestoneId}/RESEARCH.md`;
  await Bun.write(path, "## Research\nFindings here.");
  expect(await isPhaseArtifactComplete(projectRoot, "RESEARCH", milestoneId)).toBe(true);
});

test("isPhaseArtifactComplete PLAN_MILESTONE: false when no file", async () => {
  expect(await isPhaseArtifactComplete(projectRoot, "PLAN_MILESTONE", milestoneId)).toBe(false);
});

test("isPhaseArtifactComplete PLAN_MILESTONE: false when placeholder", async () => {
  const path = `${projectRoot}/.superclaude/state/milestones/${milestoneId}/ROADMAP.md`;
  await Bun.write(path, "_To be planned during PLAN_MILESTONE phase._");
  expect(await isPhaseArtifactComplete(projectRoot, "PLAN_MILESTONE", milestoneId)).toBe(false);
});

test("isPhaseArtifactComplete PLAN_MILESTONE: true when filled", async () => {
  const path = `${projectRoot}/.superclaude/state/milestones/${milestoneId}/ROADMAP.md`;
  await Bun.write(path, "## Slices\n- S01: Setup");
  expect(await isPhaseArtifactComplete(projectRoot, "PLAN_MILESTONE", milestoneId)).toBe(true);
});

test("isPhaseArtifactComplete returns false for unknown phase", async () => {
  expect(await isPhaseArtifactComplete(projectRoot, "UNKNOWN", milestoneId)).toBe(false);
});
