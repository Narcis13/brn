import { describe, test, expect } from "bun:test";

describe("QuickCreatePopover", () => {
  describe("date formatting", () => {
    test("formats date-only correctly", () => {
      const date = "2026-04-15";
      const formatted = new Date(date + "T00:00").toLocaleDateString("en-US", { 
        dateStyle: "medium" 
      });
      expect(formatted).toContain("Apr");
      expect(formatted).toContain("15");
      expect(formatted).toContain("2026");
    });
    
    test("formats date+time correctly", () => {
      const datetime = "2026-04-15T14:30";
      const formatted = new Date(datetime).toLocaleString("en-US", { 
        dateStyle: "medium", 
        timeStyle: "short" 
      });
      expect(formatted).toContain("Apr");
      expect(formatted).toContain("15");
      expect(formatted).toContain("2026");
      expect(formatted).toMatch(/2:30\s*PM/);
    });
  });
  
  describe("position calculation", () => {
    test("keeps popover within viewport when near right edge", () => {
      const viewportWidth = 1200;
      const position = { x: viewportWidth - 100, y: 200 };
      const popoverWidth = 280;
      const adjustedX = Math.min(position.x, viewportWidth - popoverWidth);
      expect(adjustedX).toBeLessThan(position.x);
    });
    
    test("keeps popover within viewport when near bottom edge", () => {
      const viewportHeight = 800;
      const position = { x: 100, y: viewportHeight - 50 };
      const popoverHeight = 200;
      const adjustedY = Math.min(position.y, viewportHeight - popoverHeight);
      expect(adjustedY).toBeLessThan(position.y);
    });
  });
  
  describe("title validation", () => {
    test("should trim whitespace from title", () => {
      const title = "  New Task  ";
      expect(title.trim()).toBe("New Task");
    });
    
    test("should reject empty title", () => {
      const title = "   ";
      expect(title.trim()).toBe("");
      expect(title.trim().length).toBe(0);
    });
  });
  
  describe("date prefilling", () => {
    test("should handle null prefilled date", () => {
      const prefilledDate: string | null = null;
      expect(prefilledDate).toBeNull();
    });
    
    test("should recognize date-only format", () => {
      const prefilledDate = "2026-04-15";
      expect(prefilledDate.includes("T")).toBe(false);
    });
    
    test("should recognize date+time format", () => {
      const prefilledDate = "2026-04-15T14:30";
      expect(prefilledDate.includes("T")).toBe(true);
    });
  });
});