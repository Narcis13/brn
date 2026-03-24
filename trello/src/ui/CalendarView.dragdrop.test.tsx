import { describe, expect, it } from "bun:test";

// Test drag and drop logic for calendar view
describe("CalendarView drag-and-drop logic", () => {
  describe("Date manipulation helpers", () => {
    it("should extract date from datetime string", () => {
      const getDateOnly = (datetime: string | null): string | null => {
        if (!datetime) return null;
        return datetime.split("T")[0] || null;
      };
      
      expect(getDateOnly("2024-01-15T14:30")).toBe("2024-01-15");
      expect(getDateOnly("2024-01-15")).toBe("2024-01-15");
      expect(getDateOnly(null)).toBe(null);
    });
    
    it("should format datetime with time", () => {
      const formatDateTime = (date: string, time: string): string => {
        const [hour, minute] = time.split(":");
        return `${date}T${hour?.padStart(2, "0")}:${minute?.padStart(2, "0")}`;
      };
      
      expect(formatDateTime("2024-01-15", "9:00")).toBe("2024-01-15T09:00");
      expect(formatDateTime("2024-01-15", "14:30")).toBe("2024-01-15T14:30");
      expect(formatDateTime("2024-01-15", "0:00")).toBe("2024-01-15T00:00");
    });
    
    it("should check if dropping on same date", () => {
      const isSameDate = (originalDate: string | null, targetDate: string): boolean => {
        if (!originalDate) return false;
        return originalDate.startsWith(targetDate);
      };
      
      expect(isSameDate("2024-01-15T14:30", "2024-01-15")).toBe(true);
      expect(isSameDate("2024-01-15", "2024-01-15")).toBe(true);
      expect(isSameDate("2024-01-15", "2024-01-16")).toBe(false);
      expect(isSameDate(null, "2024-01-15")).toBe(false);
    });
  });
  
  describe("Drag state management", () => {
    it("should properly set drag data", () => {
      const dragState = {
        cardId: "",
        originalDate: null as string | null
      };
      
      const setDragData = (cardId: string, dueDate: string | null) => {
        dragState.cardId = cardId;
        dragState.originalDate = dueDate;
      };
      
      setDragData("card-1", "2024-01-15");
      expect(dragState.cardId).toBe("card-1");
      expect(dragState.originalDate).toBe("2024-01-15");
      
      setDragData("card-2", null);
      expect(dragState.cardId).toBe("card-2");
      expect(dragState.originalDate).toBe(null);
    });
    
    it("should clear drag state", () => {
      const dragState = {
        cardId: "card-1",
        originalDate: "2024-01-15"
      };
      
      const clearDragState = () => {
        dragState.cardId = "";
        dragState.originalDate = null;
      };
      
      clearDragState();
      expect(dragState.cardId).toBe("");
      expect(dragState.originalDate).toBe(null);
    });
  });
  
  describe("Drop validation", () => {
    it("should validate drop on different dates", () => {
      const canDrop = (originalDate: string | null, targetDate: string): boolean => {
        if (!originalDate) return true;
        return !originalDate.startsWith(targetDate);
      };
      
      // Can drop on different date
      expect(canDrop("2024-01-15", "2024-01-16")).toBe(true);
      expect(canDrop("2024-01-15T10:00", "2024-01-16")).toBe(true);
      
      // Cannot drop on same date
      expect(canDrop("2024-01-15", "2024-01-15")).toBe(false);
      expect(canDrop("2024-01-15T10:00", "2024-01-15")).toBe(false);
      
      // Can drop if no original date
      expect(canDrop(null, "2024-01-15")).toBe(true);
    });
  });
  
  describe("Time slot calculations", () => {
    it("should determine time slot from drag position", () => {
      const getTimeSlot = (hour: number, minute: number): string => {
        const slot = minute < 30 ? "00" : "30";
        return `${hour}:${slot}`;
      };
      
      expect(getTimeSlot(9, 15)).toBe("9:00");
      expect(getTimeSlot(9, 45)).toBe("9:30");
      expect(getTimeSlot(14, 0)).toBe("14:00");
      expect(getTimeSlot(14, 30)).toBe("14:30");
    });
    
    it("should check if card belongs to time slot", () => {
      const isInTimeSlot = (cardTime: string, slotHour: number, slotMinute: number): boolean => {
        const [cardHour, cardMinute] = cardTime.split(":").map(Number);
        
        return cardHour === slotHour && 
          ((slotMinute === 0 && cardMinute! >= 0 && cardMinute! < 30) ||
           (slotMinute === 30 && cardMinute! >= 30 && cardMinute! < 60));
      };
      
      expect(isInTimeSlot("9:15", 9, 0)).toBe(true);
      expect(isInTimeSlot("9:15", 9, 30)).toBe(false);
      expect(isInTimeSlot("9:45", 9, 30)).toBe(true);
      expect(isInTimeSlot("10:00", 9, 0)).toBe(false);
    });
  });
  
  describe("Multi-day card calculations", () => {
    it("should calculate card span in days", () => {
      const calculateDaySpan = (startDate: string, endDate: string): number => {
        const start = new Date(startDate.split("T")[0]!);
        const end = new Date(endDate.split("T")[0]!);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays + 1; // +1 to include both start and end days
      };
      
      expect(calculateDaySpan("2024-01-15", "2024-01-15")).toBe(1);
      expect(calculateDaySpan("2024-01-15", "2024-01-16")).toBe(2);
      expect(calculateDaySpan("2024-01-15", "2024-01-20")).toBe(6);
    });
    
    it("should determine if card spans multiple weeks", () => {
      const spansMultipleWeeks = (startIndex: number, endIndex: number): boolean => {
        const startWeek = Math.floor(startIndex / 7);
        const endWeek = Math.floor(endIndex / 7);
        return startWeek !== endWeek;
      };
      
      // Same week
      expect(spansMultipleWeeks(0, 6)).toBe(false);   // Mon-Sun of week 1
      expect(spansMultipleWeeks(7, 13)).toBe(false);  // Mon-Sun of week 2
      
      // Multiple weeks
      expect(spansMultipleWeeks(5, 8)).toBe(true);    // Sat of week 1 to Tue of week 2
      expect(spansMultipleWeeks(0, 14)).toBe(true);   // Mon of week 1 to Mon of week 3
    });
  });
});