/**
 * SUPER_CLAUDE — Multi-Milestone Manager
 * Handles milestone lifecycle: discovery, ordering, status tracking, and navigation.
 * Per spec §4.1: Milestones are shippable versions containing 4-10 slices.
 */

import { PATHS, type MilestoneStatus, type MilestoneRoadmap } from "./types.ts";

// ─── Types ──────────────────────────────────────────────────────

export interface MilestoneInfo {
  id: string;
  status: MilestoneStatus;
  description: string;
  sliceCount: number;
  completedSlices: number;
}

// ─── Discovery ──────────────────────────────────────────────────

/**
 * List all milestones that exist on disk, sorted by ID.
 */
export async function listMilestones(
  projectRoot: string
): Promise<MilestoneInfo[]> {
  const milestonesDir = `${projectRoot}/${PATHS.state}/milestones`;
  const milestones: MilestoneInfo[] = [];

  try {
    const glob = new Bun.Glob("M*/ROADMAP.md");
    for await (const path of glob.scan({ cwd: milestonesDir })) {
      const id = path.split("/")[0]!;
      const roadmapContent = await Bun.file(`${milestonesDir}/${path}`).text();
      const info = parseMilestoneInfo(id, roadmapContent, milestonesDir);
      milestones.push(await info);
    }
  } catch {
    // Directory may not exist
  }

  return milestones.sort((a, b) => a.id.localeCompare(b.id));
}

async function parseMilestoneInfo(
  id: string,
  roadmapContent: string,
  milestonesDir: string
): Promise<MilestoneInfo> {
  // Parse frontmatter for status and description
  const fm = parseFrontmatter(roadmapContent);
  const status = (fm["status"] ?? "pending") as MilestoneStatus;
  const description = fm["description"] ?? "";

  // Count slices
  const slicesDir = `${milestonesDir}/${id}/slices`;
  let sliceCount = 0;
  let completedSlices = 0;

  try {
    const sliceGlob = new Bun.Glob("S*/PLAN.md");
    for await (const slicePath of sliceGlob.scan({ cwd: slicesDir })) {
      sliceCount++;
      const sliceId = slicePath.split("/")[0]!;
      const summaryFile = Bun.file(`${slicesDir}/${sliceId}/SUMMARY.md`);
      if (await summaryFile.exists()) {
        completedSlices++;
      }
    }
  } catch {
    // No slices yet
  }

  return { id, status, description, sliceCount, completedSlices };
}

/**
 * Find the next milestone to work on.
 * Priority: in_progress > pending (by ID order).
 */
export async function findNextMilestone(
  projectRoot: string
): Promise<string | null> {
  const milestones = await listMilestones(projectRoot);

  // First, find any in-progress milestone
  const inProgress = milestones.find((m) => m.status === "in_progress");
  if (inProgress) return inProgress.id;

  // Then, find the first pending milestone
  const pending = milestones.find((m) => m.status === "pending");
  if (pending) return pending.id;

  return null;
}

// ─── Spec Discovery ─────────────────────────────────────────────

export interface SpecInfo {
  filename: string;
  title: string;
  status: "draft" | "ready";
  priority: "high" | "medium" | "low";
  milestone: string | null;
}

/**
 * List all specs in the specs directory.
 */
export async function listSpecs(projectRoot: string): Promise<SpecInfo[]> {
  const specsDir = `${projectRoot}/${PATHS.specs}`;
  const specs: SpecInfo[] = [];

  try {
    const glob = new Bun.Glob("*.md");
    for await (const path of glob.scan({ cwd: specsDir })) {
      const content = await Bun.file(`${specsDir}/${path}`).text();
      const fm = parseFrontmatter(content);

      specs.push({
        filename: path,
        title: fm["title"] ?? path.replace(".md", ""),
        status: fm["status"] === "ready" ? "ready" : "draft",
        priority: (fm["priority"] ?? "medium") as SpecInfo["priority"],
        milestone: fm["milestone"] ?? null,
      });
    }
  } catch {
    // Directory may not exist
  }

  return specs;
}

/**
 * Find ready specs that don't have a milestone assigned yet.
 */
export async function findReadySpecs(
  projectRoot: string
): Promise<SpecInfo[]> {
  const specs = await listSpecs(projectRoot);
  return specs.filter((s) => s.status === "ready");
}

// ─── Slice Navigation ───────────────────────────────────────────

export interface SliceInfo {
  id: string;
  status: "pending" | "in_progress" | "complete";
  demoSentence: string;
}

/**
 * List all slices for a milestone, with their status.
 */
export async function listSlices(
  projectRoot: string,
  milestoneId: string
): Promise<SliceInfo[]> {
  const slicesDir = `${projectRoot}/${PATHS.milestonePath(milestoneId)}/slices`;
  const slices: SliceInfo[] = [];

  try {
    const glob = new Bun.Glob("S*/PLAN.md");
    for await (const path of glob.scan({ cwd: slicesDir })) {
      const sliceId = path.split("/")[0]!;
      const content = await Bun.file(`${slicesDir}/${path}`).text();
      const fm = parseFrontmatter(content);

      // Check if SUMMARY.md exists (complete)
      const summaryExists = await Bun.file(`${slicesDir}/${sliceId}/SUMMARY.md`).exists();

      slices.push({
        id: sliceId,
        status: summaryExists ? "complete" : fm["status"] === "in_progress" ? "in_progress" : "pending",
        demoSentence: fm["demo_sentence"]?.replace(/^"|"$/g, "") ?? "",
      });
    }
  } catch {
    // Directory may not exist
  }

  return slices.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Find the next slice to work on within a milestone.
 */
export async function findNextSlice(
  projectRoot: string,
  milestoneId: string
): Promise<string | null> {
  const slices = await listSlices(projectRoot, milestoneId);

  const inProgress = slices.find((s) => s.status === "in_progress");
  if (inProgress) return inProgress.id;

  const pending = slices.find((s) => s.status === "pending");
  if (pending) return pending.id;

  return null;
}

// ─── Task Navigation ────────────────────────────────────────────

export interface TaskInfo {
  id: string;
  status: "pending" | "in_progress" | "complete";
  goal: string;
}

/**
 * List all tasks for a slice, with their status.
 */
export async function listTasks(
  projectRoot: string,
  milestoneId: string,
  sliceId: string
): Promise<TaskInfo[]> {
  const tasksDir = `${projectRoot}/${PATHS.slicePath(milestoneId, sliceId)}/tasks`;
  const tasks: TaskInfo[] = [];

  try {
    const glob = new Bun.Glob("T*/PLAN.md");
    for await (const path of glob.scan({ cwd: tasksDir })) {
      const taskId = path.split("/")[0]!;
      const content = await Bun.file(`${tasksDir}/${path}`).text();
      const fm = parseFrontmatter(content);

      // Check if SUMMARY.md exists (complete)
      const summaryExists = await Bun.file(`${tasksDir}/${taskId}/SUMMARY.md`).exists();

      // Extract goal from ## Goal section
      const goalMatch = content.match(/## Goal\n([\s\S]*?)(?=\n## |\n---|\s*$)/);
      const goal = goalMatch?.[1]?.trim() ?? "";

      tasks.push({
        id: taskId,
        status: summaryExists ? "complete" : fm["status"] === "in_progress" ? "in_progress" : "pending",
        goal,
      });
    }
  } catch {
    // Directory may not exist
  }

  return tasks.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Find the next task to work on within a slice.
 */
export async function findNextTask(
  projectRoot: string,
  milestoneId: string,
  sliceId: string
): Promise<string | null> {
  const tasks = await listTasks(projectRoot, milestoneId, sliceId);

  const inProgress = tasks.find((t) => t.status === "in_progress");
  if (inProgress) return inProgress.id;

  const pending = tasks.find((t) => t.status === "pending");
  if (pending) return pending.id;

  return null;
}

/**
 * Check if all tasks in a slice are complete.
 */
export async function isSliceComplete(
  projectRoot: string,
  milestoneId: string,
  sliceId: string
): Promise<boolean> {
  const tasks = await listTasks(projectRoot, milestoneId, sliceId);
  if (tasks.length === 0) return false;
  return tasks.every((t) => t.status === "complete");
}

/**
 * Check if all slices in a milestone are complete.
 */
export async function isMilestoneComplete(
  projectRoot: string,
  milestoneId: string
): Promise<boolean> {
  const slices = await listSlices(projectRoot, milestoneId);
  if (slices.length === 0) return false;
  return slices.every((s) => s.status === "complete");
}

// ─── Next Milestone ID ─────────────────────────────────────────

/**
 * Generate the next milestone ID (M001, M002, etc.)
 */
export async function nextMilestoneId(
  projectRoot: string
): Promise<string> {
  const milestones = await listMilestones(projectRoot);

  if (milestones.length === 0) return "M001";

  const numbers = milestones
    .map((m) => parseInt(m.id.replace("M", ""), 10))
    .filter((n) => !isNaN(n));

  const max = Math.max(...numbers);
  return `M${String(max + 1).padStart(3, "0")}`;
}

// ─── Helpers ────────────────────────────────────────────────────

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match?.[1]) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  return result;
}
