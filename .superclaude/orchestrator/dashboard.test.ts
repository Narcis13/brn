import { test, expect } from "bun:test";
import {
  renderDashboard,
  renderDashboardMarkdown,
  type DashboardData,
} from "./dashboard.ts";

// ─── Test Data ────────────────────────────────────────────────

function makeDashboardData(overrides?: Partial<DashboardData>): DashboardData {
  return {
    state: {
      phase: "EXECUTE_TASK",
      tddSubPhase: "GREEN",
      currentMilestone: "M001",
      currentSlice: "S01",
      currentTask: "T02",
      lastUpdated: "2026-03-18T12:00:00Z",
    },
    milestones: [
      {
        id: "M001",
        description: "Core infrastructure",
        status: "in_progress",
        progress: 60,
        slices: [
          {
            id: "S01",
            demoSentence: "User can authenticate",
            status: "in_progress",
            taskCount: 3,
            completedTasks: 2,
          },
          {
            id: "S02",
            demoSentence: "User can create project",
            status: "pending",
            taskCount: 4,
            completedTasks: 0,
          },
        ],
      },
    ],
    budget: {
      currentCost: 12.5,
      budgetCeiling: 25,
      percentUsed: 50,
      pressureTier: "YELLOW",
    },
    health: {
      compoundingScore: 72,
      sessionsTracked: 5,
      trend: "improving",
    },
    ...overrides,
  };
}

// ─── Console Rendering ────────────────────────────────────────

test("renderDashboard includes header", () => {
  const output = renderDashboard(makeDashboardData());
  expect(output).toContain("SUPER_CLAUDE — Dashboard");
});

test("renderDashboard shows current state", () => {
  const output = renderDashboard(makeDashboardData());
  expect(output).toContain("EXECUTE_TASK");
  expect(output).toContain("GREEN");
  expect(output).toContain("M001");
  expect(output).toContain("S01");
  expect(output).toContain("T02");
});

test("renderDashboard shows budget info", () => {
  const output = renderDashboard(makeDashboardData());
  expect(output).toContain("50.0%");
  expect(output).toContain("$12.50");
  expect(output).toContain("$25.00");
  expect(output).toContain("[YELLOW]");
});

test("renderDashboard shows milestone progress", () => {
  const output = renderDashboard(makeDashboardData());
  expect(output).toContain("M001");
  expect(output).toContain("Core infrastructure");
  expect(output).toContain("60%");
});

test("renderDashboard shows slice details", () => {
  const output = renderDashboard(makeDashboardData());
  expect(output).toContain("S01");
  expect(output).toContain("User can authenticate");
  expect(output).toContain("2/3");
  expect(output).toContain("S02");
  expect(output).toContain("0/4");
});

test("renderDashboard shows health info", () => {
  const output = renderDashboard(makeDashboardData());
  expect(output).toContain("72/100");
  expect(output).toContain("5");
  expect(output).toContain("improving");
});

test("renderDashboard shows 'no milestones' when empty", () => {
  const output = renderDashboard(makeDashboardData({ milestones: [] }));
  expect(output).toContain("No milestones planned yet");
});

test("renderDashboard shows status icons", () => {
  const output = renderDashboard(makeDashboardData());
  expect(output).toContain("[>]"); // in_progress
  expect(output).toContain("[ ]"); // pending
});

test("renderDashboard shows completed milestone", () => {
  const data = makeDashboardData({
    milestones: [
      {
        id: "M001",
        description: "Done milestone",
        status: "complete",
        progress: 100,
        slices: [
          {
            id: "S01",
            demoSentence: "All done",
            status: "complete",
            taskCount: 2,
            completedTasks: 2,
          },
        ],
      },
    ],
  });
  const output = renderDashboard(data);
  expect(output).toContain("[x]"); // complete
  expect(output).toContain("100%");
});

test("renderDashboard handles all budget tiers", () => {
  for (const tier of ["GREEN", "YELLOW", "ORANGE", "RED"] as const) {
    const output = renderDashboard(
      makeDashboardData({ budget: { currentCost: 0, budgetCeiling: 25, percentUsed: 0, pressureTier: tier } })
    );
    expect(output).toContain(`[${tier}]`);
  }
});

test("renderDashboard handles null tddSubPhase", () => {
  const data = makeDashboardData();
  data.state.tddSubPhase = null;
  const output = renderDashboard(data);
  expect(output).toContain("n/a");
});

// ─── Markdown Rendering ───────────────────────────────────────

test("renderDashboardMarkdown includes title", () => {
  const output = renderDashboardMarkdown(makeDashboardData());
  expect(output).toContain("# SUPER_CLAUDE — Progress Report");
});

test("renderDashboardMarkdown includes current state table", () => {
  const output = renderDashboardMarkdown(makeDashboardData());
  expect(output).toContain("| Phase | EXECUTE_TASK |");
  expect(output).toContain("| TDD Sub-Phase | GREEN |");
  expect(output).toContain("| Milestone | M001 |");
});

test("renderDashboardMarkdown includes budget table", () => {
  const output = renderDashboardMarkdown(makeDashboardData());
  expect(output).toContain("| Current Cost | $12.50 |");
  expect(output).toContain("| Budget Ceiling | $25.00 |");
  expect(output).toContain("| Usage | 50.0% |");
  expect(output).toContain("| Pressure Tier | YELLOW |");
});

test("renderDashboardMarkdown includes milestone details", () => {
  const output = renderDashboardMarkdown(makeDashboardData());
  expect(output).toContain("### M001: Core infrastructure");
  expect(output).toContain("**Status:** in_progress");
  expect(output).toContain("**Progress:** 60%");
});

test("renderDashboardMarkdown includes slice table", () => {
  const output = renderDashboardMarkdown(makeDashboardData());
  expect(output).toContain("| S01 | User can authenticate | in_progress | 2/3 |");
  expect(output).toContain("| S02 | User can create project | pending | 0/4 |");
});

test("renderDashboardMarkdown includes health table", () => {
  const output = renderDashboardMarkdown(makeDashboardData());
  expect(output).toContain("| Compounding Score | 72/100 |");
  expect(output).toContain("| Sessions Tracked | 5 |");
  expect(output).toContain("| Trend | improving |");
});

test("renderDashboardMarkdown shows no milestones message", () => {
  const output = renderDashboardMarkdown(makeDashboardData({ milestones: [] }));
  expect(output).toContain("_No milestones planned yet._");
});

test("renderDashboardMarkdown handles null state fields", () => {
  const data = makeDashboardData();
  data.state.currentMilestone = null;
  data.state.currentSlice = null;
  data.state.currentTask = null;
  data.state.tddSubPhase = null;
  const output = renderDashboardMarkdown(data);
  expect(output).toContain("| TDD Sub-Phase | n/a |");
  expect(output).toContain("| Milestone | none |");
  expect(output).toContain("| Slice | none |");
  expect(output).toContain("| Task | none |");
});
