import { describe, it, expect } from "bun:test";
import { isValidDateFormat, compareDates } from "./date-utils";

describe("isValidDateFormat", () => {
  describe("date-only format (YYYY-MM-DD)", () => {
    it("accepts valid dates", () => {
      expect(isValidDateFormat("2026-03-24")).toBe(true);
      expect(isValidDateFormat("2000-01-01")).toBe(true);
      expect(isValidDateFormat("2026-12-31")).toBe(true);
      expect(isValidDateFormat("1970-01-01")).toBe(true);
    });

    it("rejects invalid dates", () => {
      expect(isValidDateFormat("2026-13-01")).toBe(false); // Invalid month
      expect(isValidDateFormat("2026-00-01")).toBe(false); // Invalid month
      expect(isValidDateFormat("2026-02-30")).toBe(false); // Feb 30
      expect(isValidDateFormat("2026-04-31")).toBe(false); // April 31
      expect(isValidDateFormat("2026-01-00")).toBe(false); // Invalid day
      expect(isValidDateFormat("2026-01-32")).toBe(false); // Invalid day
    });

    it("rejects malformed date strings", () => {
      expect(isValidDateFormat("2026-1-1")).toBe(false); // Missing padding
      expect(isValidDateFormat("26-01-01")).toBe(false); // 2-digit year
      expect(isValidDateFormat("2026/01/01")).toBe(false); // Wrong separator
      expect(isValidDateFormat("01-01-2026")).toBe(false); // Wrong order
      expect(isValidDateFormat("2026")).toBe(false); // Year only
      expect(isValidDateFormat("2026-01")).toBe(false); // Year-month only
    });
  });

  describe("datetime format (YYYY-MM-DDTHH:MM)", () => {
    it("accepts valid datetimes", () => {
      expect(isValidDateFormat("2026-03-24T14:30")).toBe(true);
      expect(isValidDateFormat("2026-01-01T00:00")).toBe(true);
      expect(isValidDateFormat("2026-12-31T23:59")).toBe(true);
      expect(isValidDateFormat("2026-06-15T12:00")).toBe(true);
    });

    it("rejects invalid times", () => {
      expect(isValidDateFormat("2026-03-24T24:00")).toBe(false); // 24:00 rejected
      expect(isValidDateFormat("2026-03-24T25:00")).toBe(false); // Invalid hour
      expect(isValidDateFormat("2026-03-24T14:60")).toBe(false); // Invalid minute
      expect(isValidDateFormat("2026-03-24T1:5")).toBe(false); // Missing padding
      expect(isValidDateFormat("2026-03-24T-1:00")).toBe(false); // Negative hour
      expect(isValidDateFormat("2026-03-24T14:-5")).toBe(false); // Negative minute
    });

    it("rejects malformed datetime strings", () => {
      expect(isValidDateFormat("2026-03-24 14:30")).toBe(false); // Space instead of T
      expect(isValidDateFormat("2026-03-24T14:30:00")).toBe(false); // With seconds
      expect(isValidDateFormat("2026-03-24T14")).toBe(false); // Missing minutes
      expect(isValidDateFormat("2026-03-24T")).toBe(false); // Missing time
    });
  });

  describe("edge cases", () => {
    it("rejects empty or null values", () => {
      expect(isValidDateFormat("")).toBe(false);
      expect(isValidDateFormat(null as any)).toBe(false);
      expect(isValidDateFormat(undefined as any)).toBe(false);
    });

    it("validates leap year dates", () => {
      expect(isValidDateFormat("2024-02-29")).toBe(true); // Valid leap year
      expect(isValidDateFormat("2023-02-29")).toBe(false); // Invalid non-leap year
    });
  });
});

describe("compareDates", () => {
  it("compares date-only strings correctly", () => {
    expect(compareDates("2026-01-01", "2026-01-02")).toBe(-1);
    expect(compareDates("2026-01-02", "2026-01-01")).toBe(1);
    expect(compareDates("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("compares datetime strings correctly", () => {
    expect(compareDates("2026-01-01T10:00", "2026-01-01T11:00")).toBe(-1);
    expect(compareDates("2026-01-01T11:00", "2026-01-01T10:00")).toBe(1);
    expect(compareDates("2026-01-01T10:00", "2026-01-01T10:00")).toBe(0);
  });

  it("compares mixed formats correctly", () => {
    // Date-only is treated as start of day, so it's less than any time on that day
    expect(compareDates("2026-01-01", "2026-01-01T00:00")).toBe(-1);
    expect(compareDates("2026-01-01", "2026-01-01T23:59")).toBe(-1);
    expect(compareDates("2026-01-01T00:00", "2026-01-01")).toBe(1);
  });

  it("handles null values correctly", () => {
    expect(compareDates(null, null)).toBe(0);
    expect(compareDates("2026-01-01", null)).toBe(-1);
    expect(compareDates(null, "2026-01-01")).toBe(1);
  });
});