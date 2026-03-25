import { describe, it, expect } from "bun:test";

describe("CalendarView Week Drag-to-Reschedule", () => {
  describe("Drag direction detection", () => {
    it("should detect vertical drag (same day, different time)", () => {
      const detectDragDirection = (
        originalDate: string | null,
        targetDate: string,
        targetTime: string
      ): "vertical" | "horizontal" | "diagonal" => {
        if (!originalDate || !originalDate.includes("T")) return "diagonal";
        
        const originalDateOnly = originalDate.split("T")[0];
        const originalTime = originalDate.split("T")[1];
        
        if (originalDateOnly === targetDate && originalTime !== targetTime) {
          return "vertical";
        } else if (originalDateOnly !== targetDate) {
          return "horizontal";
        }
        
        return "diagonal";
      };
      
      expect(detectDragDirection("2026-03-25T09:30", "2026-03-25", "14:00")).toBe("vertical");
      expect(detectDragDirection("2026-03-25T09:30", "2026-03-25", "09:30")).toBe("diagonal");
      expect(detectDragDirection("2026-03-25T09:30", "2026-03-26", "09:30")).toBe("horizontal");
      expect(detectDragDirection("2026-03-25T09:30", "2026-03-26", "14:00")).toBe("horizontal");
      expect(detectDragDirection("2026-03-25", "2026-03-25", "14:00")).toBe("diagonal");
    });
  });
  
  describe("Time-only updates (vertical drag)", () => {
    it("should update only time when dragging vertically", () => {
      const updateTimeOnly = (originalDate: string, newTime: string): string => {
        const dateOnly = originalDate.split("T")[0];
        const [hour, minute] = newTime.split(":");
        return `${dateOnly}T${hour?.padStart(2, "0")}:${minute?.padStart(2, "0")}`;
      };
      
      expect(updateTimeOnly("2026-03-25T09:30", "14:00")).toBe("2026-03-25T14:00");
      expect(updateTimeOnly("2026-03-25T09:30", "7:30")).toBe("2026-03-25T07:30");
      expect(updateTimeOnly("2026-03-25T09:30", "22:00")).toBe("2026-03-25T22:00");
    });
    
    it("should preserve date when dragging to different time slot", () => {
      const preserveDateUpdateTime = (
        dueDate: string | null,
        targetTime: string
      ): { due_date: string } | null => {
        if (!dueDate) return null;
        
        const dateOnly = dueDate.split("T")[0];
        const [hour, minute] = targetTime.split(":");
        const formattedTime = `${hour?.padStart(2, "0")}:${minute?.padStart(2, "0")}`;
        
        return {
          due_date: `${dateOnly}T${formattedTime}`
        };
      };
      
      expect(preserveDateUpdateTime("2026-03-25T09:30", "14:00")).toEqual({
        due_date: "2026-03-25T14:00"
      });
      expect(preserveDateUpdateTime(null, "14:00")).toBe(null);
    });
  });
  
  describe("Date-only updates (horizontal drag)", () => {
    it("should update only date when dragging horizontally", () => {
      const updateDateOnly = (originalDate: string, newDate: string): string => {
        const originalTime = originalDate.split("T")[1];
        if (originalTime) {
          return `${newDate}T${originalTime}`;
        }
        return newDate;
      };
      
      expect(updateDateOnly("2026-03-25T09:30", "2026-03-26")).toBe("2026-03-26T09:30");
      expect(updateDateOnly("2026-03-25T14:00", "2026-03-27")).toBe("2026-03-27T14:00");
      expect(updateDateOnly("2026-03-25", "2026-03-26")).toBe("2026-03-26");
    });
    
    it("should preserve time when dragging to different day", () => {
      const preserveTimeUpdateDate = (
        dueDate: string | null,
        targetDate: string
      ): { due_date: string } | null => {
        if (!dueDate) return null;
        
        const originalTime = dueDate.split("T")[1];
        if (originalTime) {
          return {
            due_date: `${targetDate}T${originalTime}`
          };
        }
        
        return {
          due_date: targetDate
        };
      };
      
      expect(preserveTimeUpdateDate("2026-03-25T09:30", "2026-03-26")).toEqual({
        due_date: "2026-03-26T09:30"
      });
      expect(preserveTimeUpdateDate("2026-03-25", "2026-03-26")).toEqual({
        due_date: "2026-03-26"
      });
      expect(preserveTimeUpdateDate(null, "2026-03-26")).toBe(null);
    });
  });
  
  describe("Multi-day card drag behavior", () => {
    it("should shift both dates when dragging multi-day card horizontally", () => {
      const shiftMultiDayCard = (
        startDate: string | null,
        dueDate: string | null,
        targetDate: string
      ): { start_date?: string; due_date?: string } => {
        if (!dueDate) return {};
        
        const dueDateOnly = dueDate.split("T")[0];
        const dayDiff = Math.round(
          (new Date(targetDate).getTime() - new Date(dueDateOnly!).getTime()) / 
          (1000 * 60 * 60 * 24)
        );
        
        const updates: { start_date?: string; due_date?: string } = {};
        
        // Update due date
        const dueTime = dueDate.split("T")[1];
        if (dueTime) {
          updates.due_date = `${targetDate}T${dueTime}`;
        } else {
          updates.due_date = targetDate;
        }
        
        // Update start date if exists
        if (startDate && dayDiff !== 0) {
          const startDateOnly = new Date(startDate.split("T")[0]!);
          startDateOnly.setDate(startDateOnly.getDate() + dayDiff);
          const newStartDateStr = startDateOnly.toISOString().split("T")[0];
          
          const startTime = startDate.split("T")[1];
          if (startTime) {
            updates.start_date = `${newStartDateStr}T${startTime}`;
          } else {
            updates.start_date = newStartDateStr;
          }
        }
        
        return updates;
      };
      
      // Test multi-day card with times
      expect(shiftMultiDayCard("2026-03-25T09:00", "2026-03-27T17:00", "2026-03-28")).toEqual({
        start_date: "2026-03-26T09:00",
        due_date: "2026-03-28T17:00"
      });
      
      // Test multi-day card without times
      expect(shiftMultiDayCard("2026-03-25", "2026-03-27", "2026-03-28")).toEqual({
        start_date: "2026-03-26",
        due_date: "2026-03-28"
      });
      
      // Test single-day card
      expect(shiftMultiDayCard(null, "2026-03-25T09:30", "2026-03-26")).toEqual({
        due_date: "2026-03-26T09:30"
      });
    });
    
    it("should update only due date time for vertical drag on multi-day card", () => {
      const updateMultiDayCardTime = (
        startDate: string | null,
        dueDate: string | null,
        targetTime: string
      ): { due_date?: string } => {
        if (!dueDate) return {};
        
        const dueDateOnly = dueDate.split("T")[0];
        const [hour, minute] = targetTime.split(":");
        const formattedTime = `${hour?.padStart(2, "0")}:${minute?.padStart(2, "0")}`;
        
        // Only update due date time, keep start date unchanged
        return {
          due_date: `${dueDateOnly}T${formattedTime}`
        };
      };
      
      expect(updateMultiDayCardTime("2026-03-25T09:00", "2026-03-25T17:00", "19:30")).toEqual({
        due_date: "2026-03-25T19:30"
      });
    });
  });
  
  describe("Drag constraints", () => {
    it("should validate time slot is within grid range", () => {
      const isValidTimeSlot = (time: string): boolean => {
        const [hour, minute] = time.split(":").map(Number);
        
        // Check if hour is in range 7-22
        if (hour! < 7 || hour! > 22) return false;
        
        // Check if it's a valid 30-minute slot
        if (minute !== 0 && minute !== 30) return false;
        
        // Special case: 22:30 is not valid (grid ends at 22:00)
        if (hour === 22 && minute === 30) return false;
        
        return true;
      };
      
      expect(isValidTimeSlot("7:00")).toBe(true);
      expect(isValidTimeSlot("7:30")).toBe(true);
      expect(isValidTimeSlot("22:00")).toBe(true);
      expect(isValidTimeSlot("22:30")).toBe(false);
      expect(isValidTimeSlot("6:30")).toBe(false);
      expect(isValidTimeSlot("23:00")).toBe(false);
      expect(isValidTimeSlot("14:15")).toBe(false);
    });
    
    it("should detect drop target type", () => {
      const getDropTargetType = (
        targetElement: { className: string }
      ): "slot" | "allday" | "invalid" => {
        if (targetElement.className.includes("calendar-week-slot")) {
          return "slot";
        } else if (targetElement.className.includes("calendar-week-allday-cell")) {
          return "allday";
        }
        return "invalid";
      };
      
      expect(getDropTargetType({ className: "calendar-week-slot" })).toBe("slot");
      expect(getDropTargetType({ className: "calendar-week-allday-cell" })).toBe("allday");
      expect(getDropTargetType({ className: "calendar-cell" })).toBe("invalid");
    });
  });
});