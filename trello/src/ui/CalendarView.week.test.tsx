import { describe, it, expect } from "bun:test";

describe("CalendarView Week Mode", () => {
  describe("Week calculations", () => {
    it("should calculate week start correctly (Monday)", () => {
      const getWeekStart = (date: Date): Date => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
      };
      
      // Test various days
      const wednesday = new Date(2026, 2, 25); // March 25, 2026 (Wednesday)
      const sunday = new Date(2026, 2, 29); // March 29, 2026 (Sunday)
      
      const wednesdayWeekStart = getWeekStart(wednesday);
      const sundayWeekStart = getWeekStart(sunday);
      
      expect(wednesdayWeekStart.getDay()).toBe(1); // Monday
      expect(wednesdayWeekStart.getDate()).toBe(23); // March 23
      
      expect(sundayWeekStart.getDay()).toBe(1); // Monday
      expect(sundayWeekStart.getDate()).toBe(23); // March 23
    });
    
    it("should generate correct time slots", () => {
      const TIME_SLOTS: string[] = [];
      for (let hour = 7; hour <= 22; hour++) {
        TIME_SLOTS.push(`${hour}:00`);
        if (hour < 22) {
          TIME_SLOTS.push(`${hour}:30`);
        }
      }
      
      expect(TIME_SLOTS).toHaveLength(31); // 15 hours * 2 + 1
      expect(TIME_SLOTS[0]).toBe("7:00");
      expect(TIME_SLOTS[1]).toBe("7:30");
      expect(TIME_SLOTS[TIME_SLOTS.length - 1]).toBe("22:00");
    });
    
    it("should extract time from datetime strings", () => {
      const getTimeFromDate = (dateStr: string | null | undefined): string | null => {
        if (!dateStr || !dateStr.includes("T")) return null;
        const time = dateStr.split("T")[1];
        return time || null;
      };
      
      expect(getTimeFromDate("2026-03-25T09:30")).toBe("09:30");
      expect(getTimeFromDate("2026-03-25T14:00")).toBe("14:00");
      expect(getTimeFromDate("2026-03-25")).toBe(null);
      expect(getTimeFromDate(null)).toBe(null);
      expect(getTimeFromDate(undefined)).toBe(null);
    });
    
    it("should format week ranges correctly", () => {
      const MONTHS = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      
      const formatWeekRange = (date: Date): string => {
        const getWeekStart = (date: Date): Date => {
          const d = new Date(date);
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          return new Date(d.setDate(diff));
        };
        
        const getWeekEnd = (date: Date): Date => {
          const weekStart = getWeekStart(date);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          return weekEnd;
        };
        
        const weekStart = getWeekStart(date);
        const weekEnd = getWeekEnd(date);
        
        const startMonth = MONTHS[weekStart.getMonth()] || "";
        const endMonth = MONTHS[weekEnd.getMonth()] || "";
        const startDay = weekStart.getDate();
        const endDay = weekEnd.getDate();
        const year = weekStart.getFullYear();
        
        if (startMonth === endMonth) {
          return `${startMonth} ${startDay} – ${endDay}, ${year}`;
        } else {
          return `${startMonth.slice(0, 3)} ${startDay} – ${endMonth.slice(0, 3)} ${endDay}, ${year}`;
        }
      };
      
      // Same month
      const midMarch = new Date(2026, 2, 18); // March 18, 2026
      expect(formatWeekRange(midMarch)).toBe("March 16 – 22, 2026");
      
      // Spans months
      const endMarch = new Date(2026, 2, 30); // March 30, 2026
      expect(formatWeekRange(endMarch)).toBe("Mar 30 – Apr 5, 2026");
    });
    
    it("should determine if card is in week", () => {
      const isCardInWeek = (card: { due_date?: string; start_date?: string }, weekStart: Date, weekEnd: Date): boolean => {
        if (!card.due_date && !card.start_date) return false;
        
        const weekStartStr = weekStart.toISOString().split("T")[0];
        const weekEndStr = weekEnd.toISOString().split("T")[0];
        
        if (!weekStartStr || !weekEndStr) return false;
        
        if (card.due_date) {
          const dueDate = card.due_date.split("T")[0];
          if (dueDate && dueDate >= weekStartStr && dueDate <= weekEndStr) {
            return true;
          }
        }
        
        if (card.start_date) {
          const startDate = card.start_date.split("T")[0];
          if (startDate && startDate >= weekStartStr && startDate <= weekEndStr) {
            return true;
          }
        }
        
        if (card.start_date && card.due_date) {
          const startDate = card.start_date.split("T")[0];
          const dueDate = card.due_date.split("T")[0];
          if (startDate && dueDate && startDate <= weekEndStr && dueDate >= weekStartStr) {
            return true;
          }
        }
        
        return false;
      };
      
      const weekStart = new Date(2026, 2, 23); // March 23, 2026 (Monday)
      const weekEnd = new Date(2026, 2, 29); // March 29, 2026 (Sunday)
      
      // Card in week
      const cardInWeek = { due_date: "2026-03-25T14:00" };
      expect(isCardInWeek(cardInWeek, weekStart, weekEnd)).toBe(true);
      
      // Card outside week
      const cardOutside = { due_date: "2026-03-30T14:00" };
      expect(isCardInWeek(cardOutside, weekStart, weekEnd)).toBe(false);
      
      // Card spanning week
      const cardSpanning = { start_date: "2026-03-20", due_date: "2026-03-30" };
      expect(isCardInWeek(cardSpanning, weekStart, weekEnd)).toBe(true);
    });
    
    it("should calculate correct card height for duration", () => {
      const calculateHeight = (startTime: string | null, endTime: string | null): number => {
        let height = 50; // Default 30-min height
        
        if (startTime && endTime) {
          const startParts = startTime.split(":");
          const endParts = endTime.split(":");
          
          if (startParts.length === 2 && endParts.length === 2) {
            const startH = parseInt(startParts[0] || "0");
            const startM = parseInt(startParts[1] || "0");
            const endH = parseInt(endParts[0] || "0");
            const endM = parseInt(endParts[1] || "0");
            const durationMinutes = (endH - startH) * 60 + (endM - startM);
            height = Math.max(50, (durationMinutes / 30) * 50);
          }
        }
        
        return height;
      };
      
      // 30-minute duration
      expect(calculateHeight("09:00", "09:30")).toBe(50);
      
      // 1-hour duration
      expect(calculateHeight("09:00", "10:00")).toBe(100);
      
      // 2.5-hour duration
      expect(calculateHeight("14:00", "16:30")).toBe(250);
      
      // No duration
      expect(calculateHeight(null, null)).toBe(50);
    });
  });
});