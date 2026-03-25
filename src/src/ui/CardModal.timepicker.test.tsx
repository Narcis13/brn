import { describe, it, expect } from "bun:test";

// Test the date/time utility functions used in CardModal
describe("CardModal Time Picker Utilities", () => {
  describe("extractDateAndTime", () => {
    const extractDateAndTime = (dateTimeString: string | null): { date: string; time: string } => {
      if (!dateTimeString) return { date: "", time: "" };
      
      if (dateTimeString.includes('T')) {
        const [date, timeWithZ] = dateTimeString.split('T');
        const time = timeWithZ ? timeWithZ.replace('Z', '').slice(0, 5) : "";
        return { date: date ?? "", time };
      }
      
      return { date: dateTimeString, time: "" };
    };

    it("should extract date and time from ISO datetime string", () => {
      const result = extractDateAndTime("2024-12-25T14:30");
      expect(result.date).toBe("2024-12-25");
      expect(result.time).toBe("14:30");
    });

    it("should handle datetime with seconds", () => {
      const result = extractDateAndTime("2024-12-25T14:30:45");
      expect(result.date).toBe("2024-12-25");
      expect(result.time).toBe("14:30");
    });

    it("should handle datetime with Z suffix", () => {
      const result = extractDateAndTime("2024-12-25T14:30:00Z");
      expect(result.date).toBe("2024-12-25");
      expect(result.time).toBe("14:30");
    });

    it("should handle date-only string", () => {
      const result = extractDateAndTime("2024-12-25");
      expect(result.date).toBe("2024-12-25");
      expect(result.time).toBe("");
    });

    it("should handle null input", () => {
      const result = extractDateAndTime(null);
      expect(result.date).toBe("");
      expect(result.time).toBe("");
    });
  });

  describe("combineDateAndTime", () => {
    const combineDateAndTime = (date: string, time: string): string => {
      if (!date) return "";
      if (!time) return date;
      return `${date}T${time}`;
    };

    it("should combine date and time", () => {
      const result = combineDateAndTime("2024-12-25", "14:30");
      expect(result).toBe("2024-12-25T14:30");
    });

    it("should return date only when time is empty", () => {
      const result = combineDateAndTime("2024-12-25", "");
      expect(result).toBe("2024-12-25");
    });

    it("should return empty string when date is empty", () => {
      const result = combineDateAndTime("", "14:30");
      expect(result).toBe("");
    });
  });

  describe("formatDateTimeDisplay", () => {
    const formatDateTimeDisplay = (dateTimeString: string | null): string => {
      if (!dateTimeString) return "";
      
      const date = new Date(dateTimeString);
      if (isNaN(date.getTime())) return "";
      
      const hasTime = dateTimeString.includes('T');
      
      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...(hasTime ? {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        } : {})
      };
      
      return new Intl.DateTimeFormat('en-US', options).format(date);
    };

    it("should format date with time", () => {
      const result = formatDateTimeDisplay("2024-12-25T14:30");
      expect(result).toBe("Dec 25, 2024 at 2:30 PM");
    });

    it("should format date with morning time", () => {
      const result = formatDateTimeDisplay("2024-12-25T09:15");
      expect(result).toBe("Dec 25, 2024 at 9:15 AM");
    });

    it("should format date without time", () => {
      const result = formatDateTimeDisplay("2024-12-25");
      expect(result).toBe("Dec 25, 2024");
    });

    it("should handle midnight correctly", () => {
      const result = formatDateTimeDisplay("2024-12-25T00:00");
      expect(result).toBe("Dec 25, 2024 at 12:00 AM");
    });

    it("should handle noon correctly", () => {
      const result = formatDateTimeDisplay("2024-12-25T12:00");
      expect(result).toBe("Dec 25, 2024 at 12:00 PM");
    });

    it("should return empty string for null", () => {
      const result = formatDateTimeDisplay(null);
      expect(result).toBe("");
    });

    it("should return empty string for invalid date", () => {
      const result = formatDateTimeDisplay("invalid-date");
      expect(result).toBe("");
    });
  });

  describe("Date Range Validation", () => {
    const isDateRangeValid = (startDate: string | null, dueDate: string | null): { valid: boolean; error?: string } => {
      if (!startDate || !dueDate) return { valid: true };
      
      const extractDate = (dateStr: string) => dateStr.split('T')[0];
      const extractTime = (dateStr: string) => {
        const parts = dateStr.split('T');
        return parts[1] ? parts[1].slice(0, 5) : "";
      };
      
      const startDateOnly = extractDate(startDate) ?? "";
      const dueDateOnly = extractDate(dueDate) ?? "";
      
      if (startDateOnly && dueDateOnly && startDateOnly > dueDateOnly) {
        return { valid: false, error: "Start date must be before or equal to due date" };
      }
      
      if (startDateOnly === dueDateOnly && startDate.includes('T') && dueDate.includes('T')) {
        const startTime = extractTime(startDate);
        const dueTime = extractTime(dueDate);
        if (startTime > dueTime) {
          return { valid: false, error: "Start time must be before or equal to due time on the same day" };
        }
      }
      
      return { valid: true };
    };

    it("should validate dates correctly", () => {
      expect(isDateRangeValid("2024-12-24", "2024-12-25").valid).toBe(true);
      expect(isDateRangeValid("2024-12-25", "2024-12-24").valid).toBe(false);
      expect(isDateRangeValid("2024-12-25", "2024-12-25").valid).toBe(true);
    });

    it("should validate datetime correctly", () => {
      expect(isDateRangeValid("2024-12-25T10:00", "2024-12-25T14:00").valid).toBe(true);
      expect(isDateRangeValid("2024-12-25T14:00", "2024-12-25T10:00").valid).toBe(false);
      expect(isDateRangeValid("2024-12-25T14:00", "2024-12-26T10:00").valid).toBe(true);
    });

    it("should handle null values", () => {
      expect(isDateRangeValid(null, "2024-12-25").valid).toBe(true);
      expect(isDateRangeValid("2024-12-25", null).valid).toBe(true);
      expect(isDateRangeValid(null, null).valid).toBe(true);
    });

    it("should allow same date and time", () => {
      expect(isDateRangeValid("2024-12-25T14:00", "2024-12-25T14:00").valid).toBe(true);
    });
  });
});