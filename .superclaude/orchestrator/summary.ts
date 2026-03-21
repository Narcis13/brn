/**
 * SUPER_CLAUDE — Fractal Summary System
 * Generates task, slice, and milestone summaries with ~5:1 compression at each level.
 * Summaries are generated from the level below plus actual code state.
 * Critical rule: Never summarize summaries — regenerate from source.
 */

import type { TaskSummary, SliceSummary } from "./types.ts";

// ─── Text Compression ──────────────────────────────────────────

/**
 * Compress text to approximately 1/ratio of its original size.
 * Preserves frontmatter, headings, and first sentence of each section.
 * Trims body content proportionally.
 */
export function compressText(text: string, ratio: number): string {
  const targetLength = Math.ceil(text.length / ratio);

  // If already short enough, return as-is
  if (text.length <= targetLength) {
    return text;
  }

  const lines = text.split("\n");
  const kept: string[] = [];
  let currentLength = 0;
  let inFrontmatter = false;
  let frontmatterClosed = false;

  for (const line of lines) {
    // Always keep frontmatter
    if (line.trim() === "---") {
      if (!inFrontmatter && !frontmatterClosed) {
        inFrontmatter = true;
        kept.push(line);
        currentLength += line.length + 1;
        continue;
      } else if (inFrontmatter) {
        inFrontmatter = false;
        frontmatterClosed = true;
        kept.push(line);
        currentLength += line.length + 1;
        continue;
      }
    }

    if (inFrontmatter) {
      kept.push(line);
      currentLength += line.length + 1;
      continue;
    }

    // Always keep headings
    if (line.startsWith("#")) {
      kept.push(line);
      currentLength += line.length + 1;
      continue;
    }

    // Always keep list items with key content (first few per section)
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      if (currentLength < targetLength) {
        kept.push(line);
        currentLength += line.length + 1;
        continue;
      }
    }

    // Keep other content if under budget
    if (currentLength < targetLength && line.trim().length > 0) {
      kept.push(line);
      currentLength += line.length + 1;
    }
  }

  return kept.join("\n");
}

// ─── Task Summary Generation ────────────────────────────────────

/**
 * Generate a structured markdown summary from TaskSummary data.
 * This is the format written to SUMMARY.md for each completed task.
 */
export function generateTaskSummary(data: TaskSummary): string {
  const filesLine = data.filesModified.length > 0
    ? data.filesModified.join(", ")
    : "none";

  const patternsLine = data.patternsEstablished.length > 0
    ? data.patternsEstablished.join(", ")
    : "none";

  let md = `---
task: ${data.task}
status: ${data.status}
files_modified: [${filesLine}]
patterns_established: [${patternsLine}]
---

## What Was Built
${data.whatWasBuilt}
`;

  if (Object.keys(data.keyDecisions).length > 0) {
    md += `\n## Key Decisions\n`;
    for (const [decision, rationale] of Object.entries(data.keyDecisions)) {
      md += `- **${decision}**: ${rationale}\n`;
    }
  }

  if (data.downstreamNotes.length > 0) {
    md += `\n## What Downstream Should Know\n`;
    for (const note of data.downstreamNotes) {
      md += `- ${note}\n`;
    }
  }

  return md;
}

// ─── Slice Summary Generation ───────────────────────────────────

/**
 * Generate a structured markdown summary from SliceSummary data.
 * Written to SUMMARY.md for each completed slice.
 */
export function generateSliceSummary(data: SliceSummary): string {
  let md = `---
slice: ${data.slice}
status: ${data.status}
tasks_completed: [${data.tasksCompleted.join(", ")}]
---

## Demo Sentence
${data.demoSentence}

## What Was Built
${data.whatWasBuilt}
`;

  if (data.interfacesProduced.length > 0) {
    md += `\n## Interfaces Produced\n`;
    for (const iface of data.interfacesProduced) {
      md += `- ${iface}\n`;
    }
  }

  if (data.patternsEstablished.length > 0) {
    md += `\n## Patterns Established\n`;
    for (const pattern of data.patternsEstablished) {
      md += `- ${pattern}\n`;
    }
  }

  if (data.knownLimitations.length > 0) {
    md += `\n## Known Limitations\n`;
    for (const limitation of data.knownLimitations) {
      md += `- ${limitation}\n`;
    }
  }

  return md;
}

// ─── Milestone Summary Generation ───────────────────────────────

/**
 * Generate a milestone summary from all its slice summaries.
 * This is the highest level of the fractal summary system.
 */
export function generateMilestoneSummary(
  milestoneId: string,
  description: string,
  sliceSummaries: SliceSummary[]
): string {
  const completedSlices = sliceSummaries.filter((s) => s.status === "complete");

  let md = `---
milestone: ${milestoneId}
status: complete
slices_completed: ${completedSlices.length}
---

## ${description}

## Capabilities Delivered
`;

  for (const slice of completedSlices) {
    md += `\n### ${slice.slice}: ${slice.demoSentence}\n`;
    md += `${slice.whatWasBuilt}\n`;

    if (slice.interfacesProduced.length > 0) {
      md += `\n**Interfaces:** ${slice.interfacesProduced.join(", ")}\n`;
    }
  }

  const allLimitations = sliceSummaries.flatMap((s) => s.knownLimitations);
  if (allLimitations.length > 0) {
    md += `\n## Known Limitations\n`;
    for (const limitation of allLimitations) {
      md += `- ${limitation}\n`;
    }
  }

  const allPatterns = [...new Set(sliceSummaries.flatMap((s) => s.patternsEstablished))];
  if (allPatterns.length > 0) {
    md += `\n## Patterns Established\n`;
    for (const pattern of allPatterns) {
      md += `- ${pattern}\n`;
    }
  }

  return md;
}
