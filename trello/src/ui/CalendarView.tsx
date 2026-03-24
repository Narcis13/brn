import { useState, useEffect, useCallback, useRef } from "react";
import type { BoardCard, Label, Column } from "./api.ts";
import * as api from "./api.ts";
import { getDueBadge } from "./card-utils.ts";
import { QuickCreatePopover } from "./QuickCreatePopover.tsx";

interface CalendarViewProps {
  boardId: string;
  columns: Column[];
  onCardClick: (card: BoardCard) => void;
  onCardCreated: () => void;
}

type CalendarMode = "month" | "week";

interface CalendarCard extends BoardCard {
  column_title: string;
}

interface DateCell {
  date: Date;
  dateString: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  cards: CalendarCard[];
}

interface MultiDayCard {
  card: CalendarCard;
  startIndex: number;
  endIndex: number;
  row: number;
}

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Time slots from 07:00 to 22:00 in 30-minute increments
const TIME_SLOTS: string[] = [];
for (let hour = 7; hour <= 22; hour++) {
  TIME_SLOTS.push(`${hour}:00`);
  if (hour < 22) {
    TIME_SLOTS.push(`${hour}:30`);
  }
}

function getMonthGrid(year: number, month: number): DateCell[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const today = new Date();
  
  const firstDayOfWeek = firstDay.getDay();
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  
  const cells: DateCell[] = [];
  
  const startDate = new Date(year, month, 1 - startOffset);
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + i);
    
    const isCurrentMonth = cellDate.getMonth() === month;
    const isToday = 
      cellDate.getFullYear() === today.getFullYear() &&
      cellDate.getMonth() === today.getMonth() &&
      cellDate.getDate() === today.getDate();
    
    const dateString = cellDate.toISOString().split("T")[0];
    if (dateString) {
      cells.push({
        date: cellDate,
        dateString,
        isCurrentMonth,
        isToday,
        cards: []
      });
    }
  }
  
  return cells;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  return new Date(d.setDate(diff));
}

function getWeekEnd(date: Date): Date {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return weekEnd;
}

function getWeekDays(date: Date): Date[] {
  const weekStart = getWeekStart(date);
  const days: Date[] = [];
  
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    days.push(day);
  }
  
  return days;
}

function formatWeekRange(date: Date): string {
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
}

function getTimeFromDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || !dateStr.includes("T")) return null;
  const time = dateStr.split("T")[1];
  return time || null;
}

function isCardInWeek(card: CalendarCard, weekStart: Date, weekEnd: Date): boolean {
  if (!card.due_date && !card.start_date) return false;
  
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const weekEndStr = weekEnd.toISOString().split("T")[0];
  
  if (!weekStartStr || !weekEndStr) return false;
  
  // Check if due_date is in week
  if (card.due_date) {
    const dueDate = card.due_date.split("T")[0];
    if (dueDate && dueDate >= weekStartStr && dueDate <= weekEndStr) {
      return true;
    }
  }
  
  // Check if start_date is in week
  if (card.start_date) {
    const startDate = card.start_date.split("T")[0];
    if (startDate && startDate >= weekStartStr && startDate <= weekEndStr) {
      return true;
    }
  }
  
  // Check if card spans the week
  if (card.start_date && card.due_date) {
    const startDate = card.start_date.split("T")[0];
    const dueDate = card.due_date.split("T")[0];
    if (startDate && dueDate && startDate <= weekEndStr && dueDate >= weekStartStr) {
      return true;
    }
  }
  
  return false;
}

function formatDateRange(year: number, month: number): { start: string; end: string } {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const startDate = new Date(year, month, 1 - startOffset);
  
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 41);
  
  return {
    start: startDate.toISOString().split("T")[0] || "",
    end: endDate.toISOString().split("T")[0] || ""
  };
}

function calculateMultiDayCards(cards: CalendarCard[], monthGrid: DateCell[]): MultiDayCard[] {
  const multiDayCards: MultiDayCard[] = [];
  const dateToIndexMap = new Map<string, number>();
  
  monthGrid.forEach((cell, index) => {
    dateToIndexMap.set(cell.dateString, index);
  });
  
  const occupiedRows: Set<string>[] = [];
  
  cards.forEach(card => {
    if (card.start_date && card.due_date) {
      const startDateStr = card.start_date.split("T")[0];
      const dueDateStr = card.due_date.split("T")[0];
      
      if (startDateStr && dueDateStr && startDateStr !== dueDateStr) {
        const startIndex = dateToIndexMap.get(startDateStr);
        const endIndex = dateToIndexMap.get(dueDateStr);
        
        if (startIndex !== undefined && endIndex !== undefined) {
          let row = 0;
          let foundRow = false;
          
          while (!foundRow) {
            if (!occupiedRows[row]) {
              occupiedRows[row] = new Set();
            }
            
            let canPlaceInRow = true;
            for (let i = startIndex; i <= endIndex; i++) {
              const weekRow = Math.floor(i / 7);
              const key = `${weekRow}-${i}`;
              if (occupiedRows[row]?.has(key)) {
                canPlaceInRow = false;
                break;
              }
            }
            
            if (canPlaceInRow) {
              for (let i = startIndex; i <= endIndex; i++) {
                const weekRow = Math.floor(i / 7);
                const key = `${weekRow}-${i}`;
                occupiedRows[row]?.add(key);
              }
              foundRow = true;
            } else {
              row++;
            }
          }
          
          multiDayCards.push({
            card,
            startIndex,
            endIndex,
            row
          });
        }
      }
    }
  });
  
  return multiDayCards;
}

export function CalendarView({ boardId, columns, onCardClick, onCardCreated }: CalendarViewProps): React.ReactElement {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [cards, setCards] = useState<CalendarCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month");
  const [quickCreateState, setQuickCreateState] = useState<{
    show: boolean;
    position: { x: number; y: number };
    prefilledDate: string | null;
  }>({
    show: false,
    position: { x: 0, y: 0 },
    prefilledDate: null
  });
  
  // Drag state
  const dragCard = useRef<{ cardId: string; originalDate: string | null } | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const loadCalendarData = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    
    let start: string, end: string;
    
    if (calendarMode === "month") {
      const range = formatDateRange(year, month);
      start = range.start;
      end = range.end;
    } else {
      // Week mode
      const weekStart = getWeekStart(currentDate);
      const weekEnd = getWeekEnd(currentDate);
      start = weekStart.toISOString().split("T")[0] || "";
      end = weekEnd.toISOString().split("T")[0] || "";
    }
    
    try {
      const response = await api.fetchCalendarCards(boardId, start, end);
      setCards(response.cards as CalendarCard[]);
    } finally {
      setIsLoading(false);
    }
  }, [boardId, year, month, currentDate, calendarMode]);
  
  useEffect(() => {
    void loadCalendarData();
  }, [loadCalendarData]);
  
  function navigateMonth(offset: number): void {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + offset);
      return newDate;
    });
  }
  
  function navigateWeek(offset: number): void {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(prev.getDate() + (offset * 7));
      return newDate;
    });
  }
  
  function navigateToToday(): void {
    setCurrentDate(new Date());
  }
  
  const monthGrid = getMonthGrid(year, month);
  
  // Calculate multi-day cards
  const multiDayCards = calculateMultiDayCards(cards, monthGrid);
  
  // Get IDs of cards that are rendered as multi-day bars
  const multiDayCardIds = new Set(multiDayCards.map(mdc => mdc.card.id));
  
  // Filter cards for each cell, excluding multi-day cards
  monthGrid.forEach(cell => {
    cell.cards = cards.filter(card => {
      // Skip if this card is rendered as a multi-day bar
      if (multiDayCardIds.has(card.id)) {
        return false;
      }
      
      // Show single-day cards on their due date
      if (card.due_date && card.due_date.startsWith(cell.dateString)) {
        return true;
      }
      
      return false;
    });
  });
  
  const hasCardsWithDates = cards.length > 0;
  
  async function handleQuickCreate(title: string, columnId: string, dueDate: string | null): Promise<void> {
    await api.createCard(boardId, title, columnId, "", dueDate);
    await loadCalendarData();
    onCardCreated();
  }
  
  function handleCellClick(e: React.MouseEvent, dateString: string): void {
    // Don't open popover if clicking on a card
    if ((e.target as HTMLElement).closest(".calendar-card-chip, .calendar-multiday-bar")) {
      return;
    }
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setQuickCreateState({
      show: true,
      position: { x: rect.left + 20, y: rect.top + 40 },
      prefilledDate: dateString
    });
  }
  
  function handleSlotClick(e: React.MouseEvent, dateString: string, time: string): void {
    // Don't open popover if clicking on a card
    if ((e.target as HTMLElement).closest(".calendar-week-timed-card, .calendar-week-card")) {
      return;
    }
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const [hour, minute] = time.split(":");
    const formattedTime = `${hour?.padStart(2, "0")}:${minute?.padStart(2, "0")}`;
    
    setQuickCreateState({
      show: true,
      position: { x: rect.left + 20, y: rect.top + 10 },
      prefilledDate: `${dateString}T${formattedTime}`
    });
  }
  
  // Drag handlers
  function handleCardDragStart(e: React.DragEvent, card: CalendarCard): void {
    dragCard.current = { cardId: card.id, originalDate: card.due_date };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", card.id);
    (e.target as HTMLElement).classList.add("dragging");
  }
  
  function handleCardDragEnd(e: React.DragEvent): void {
    (e.target as HTMLElement).classList.remove("dragging");
    dragCard.current = null;
    setDragOverDate(null);
    
    // Clear any drag indicators
    document.querySelectorAll(".calendar-cell-drop-active, .calendar-week-slot-drop-active")
      .forEach(el => el.classList.remove("calendar-cell-drop-active", "calendar-week-slot-drop-active"));
  }
  
  function handleCellDragOver(e: React.DragEvent, dateString: string): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateString);
    
    // Add visual feedback
    (e.currentTarget as HTMLElement).classList.add("calendar-cell-drop-active");
  }
  
  function handleCellDragLeave(e: React.DragEvent): void {
    (e.currentTarget as HTMLElement).classList.remove("calendar-cell-drop-active");
  }
  
  async function handleCellDrop(e: React.DragEvent, dateString: string): Promise<void> {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove("calendar-cell-drop-active");
    
    if (!dragCard.current) return;
    
    const { cardId, originalDate } = dragCard.current;
    
    // Don't do anything if dropping on the same date
    if (originalDate && originalDate.startsWith(dateString)) {
      return;
    }
    
    // Update the card's due date
    await api.updateCard(boardId, cardId, { dueDate: dateString });
    await loadCalendarData();
  }
  
  function handleSlotDragOver(e: React.DragEvent, dateString: string): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    (e.currentTarget as HTMLElement).classList.add("calendar-week-slot-drop-active");
  }
  
  function handleSlotDragLeave(e: React.DragEvent): void {
    (e.currentTarget as HTMLElement).classList.remove("calendar-week-slot-drop-active");
  }
  
  async function handleSlotDrop(e: React.DragEvent, dateString: string, time: string): Promise<void> {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove("calendar-week-slot-drop-active");
    
    if (!dragCard.current) return;
    
    const { cardId } = dragCard.current;
    const [hour, minute] = time.split(":");
    const formattedDateTime = `${dateString}T${hour?.padStart(2, "0")}:${minute?.padStart(2, "0")}`;
    
    // Update the card's due date with time
    await api.updateCard(boardId, cardId, { dueDate: formattedDateTime });
    await loadCalendarData();
  }
  
  return (
    <div className="calendar-container">
      <div className="calendar-nav">
        <button 
          className="calendar-nav-btn"
          onClick={() => calendarMode === "month" ? navigateMonth(-1) : navigateWeek(-1)}
          title={calendarMode === "month" ? "Previous month" : "Previous week"}
        >
          &lt;
        </button>
        
        <h2 className="calendar-nav-title">
          {calendarMode === "month" ? `${MONTHS[month]} ${year}` : formatWeekRange(currentDate)}
        </h2>
        
        <button 
          className="calendar-nav-btn"
          onClick={() => calendarMode === "month" ? navigateMonth(1) : navigateWeek(1)}
          title={calendarMode === "month" ? "Next month" : "Next week"}
        >
          &gt;
        </button>
        
        <button 
          className="calendar-nav-today"
          onClick={navigateToToday}
        >
          Today
        </button>
        
        <div className="calendar-mode-toggle">
          <button
            className={`calendar-mode-btn${calendarMode === "month" ? " active" : ""}`}
            onClick={() => setCalendarMode("month")}
          >
            Month
          </button>
          <button
            className={`calendar-mode-btn${calendarMode === "week" ? " active" : ""}`}
            onClick={() => setCalendarMode("week")}
          >
            Week
          </button>
        </div>
      </div>
      
      <div className="calendar-grid">
        <div className="calendar-header">
          {DAYS_OF_WEEK.map(day => (
            <div key={day} className="calendar-header-cell">
              {day}
            </div>
          ))}
        </div>
        
        {isLoading ? (
          <div className="calendar-loading">
            <div className="calendar-skeleton">
              {Array.from({ length: calendarMode === "month" ? 42 : 7 }, (_, i) => (
                <div key={i} className="calendar-cell skeleton-pulse" />
              ))}
            </div>
          </div>
        ) : calendarMode === "month" ? (
          <div className="calendar-body">
            {/* Multi-day bars layer */}
            {multiDayCards.map(({ card, startIndex, endIndex, row }) => {
              const startCell = Math.max(0, startIndex);
              const endCell = Math.min(41, endIndex);
              const weekRow = Math.floor(startCell / 7);
              const startCol = startCell % 7;
              const span = endCell - startCell + 1;
              
              // Check if bar spans multiple weeks
              const startWeek = Math.floor(startCell / 7);
              const endWeek = Math.floor(endCell / 7);
              
              if (startWeek === endWeek) {
                // Single week span
                const dueBadge = getDueBadge(card.due_date);
                const labelColor = card.labels[0]?.color;
                
                return (
                  <div
                    key={card.id}
                    className="calendar-multiday-bar"
                    onClick={() => onCardClick(card)}
                    draggable
                    onDragStart={(e) => handleCardDragStart(e, card)}
                    onDragEnd={handleCardDragEnd}
                    title={`${card.title}\n${card.column_title}\n${card.start_date?.split("T")[0]} → ${card.due_date?.split("T")[0]}`}
                    style={{
                      gridRow: weekRow + 1,
                      gridColumn: `${startCol + 1} / span ${span}`,
                      top: `${32 + row * 24}px`,
                      borderLeftColor: labelColor || "#0079bf"
                    }}
                  >
                    <span className="calendar-multiday-title">{card.title}</span>
                    {dueBadge && (
                      <span className={`calendar-multiday-due due-${dueBadge.tone}`} />
                    )}
                  </div>
                );
              } else {
                // Multi-week span - render separate bars for each week
                const bars = [];
                for (let week = startWeek; week <= endWeek; week++) {
                  const weekStart = week === startWeek ? startCell : week * 7;
                  const weekEnd = week === endWeek ? endCell : (week + 1) * 7 - 1;
                  const weekStartCol = weekStart % 7;
                  const weekSpan = weekEnd - weekStart + 1;
                  
                  const dueBadge = week === endWeek ? getDueBadge(card.due_date) : null;
                  const labelColor = card.labels[0]?.color;
                  
                  bars.push(
                    <div
                      key={`${card.id}-week-${week}`}
                      className="calendar-multiday-bar"
                      onClick={() => onCardClick(card)}
                      draggable
                      onDragStart={(e) => handleCardDragStart(e, card)}
                      onDragEnd={handleCardDragEnd}
                      title={`${card.title}\n${card.column_title}\n${card.start_date?.split("T")[0]} → ${card.due_date?.split("T")[0]}`}
                      style={{
                        gridRow: week + 1,
                        gridColumn: `${weekStartCol + 1} / span ${weekSpan}`,
                        top: `${32 + row * 24}px`,
                        borderLeftColor: labelColor || "#0079bf"
                      }}
                    >
                      {week === startWeek && (
                        <span className="calendar-multiday-title">{card.title}</span>
                      )}
                      {dueBadge && (
                        <span className={`calendar-multiday-due due-${dueBadge.tone}`} />
                      )}
                    </div>
                  );
                }
                return bars;
              }
            })}
            
            {/* Regular calendar cells */}
            {monthGrid.map((cell, index) => {
              const isWeekend = index % 7 >= 5;
              const visibleCards = cell.cards.slice(0, 3);
              const overflow = cell.cards.length - 3;
              
              return (
                <div
                  key={index}
                  className={`calendar-cell${
                    cell.isCurrentMonth ? "" : " calendar-cell-other-month"
                  }${cell.isToday ? " calendar-cell-today" : ""}${
                    isWeekend ? " calendar-cell-weekend" : ""
                  }`}
                  onClick={(e) => handleCellClick(e, cell.dateString)}
                  onDragOver={(e) => handleCellDragOver(e, cell.dateString)}
                  onDragLeave={handleCellDragLeave}
                  onDrop={(e) => handleCellDrop(e, cell.dateString)}
                >
                  <div className="calendar-cell-header">
                    <span className="calendar-cell-day">{cell.date.getDate()}</span>
                  </div>
                  
                  <div className="calendar-cell-cards">
                    {visibleCards.map(card => {
                      const dueBadge = getDueBadge(card.due_date);
                      const labelColor = card.labels[0]?.color;
                      
                      return (
                        <div
                          key={card.id}
                          className="calendar-card-chip"
                          onClick={() => onCardClick(card)}
                          draggable
                          onDragStart={(e) => handleCardDragStart(e, card)}
                          onDragEnd={handleCardDragEnd}
                          title={`${card.title}\n${card.column_title}`}
                          style={labelColor ? {
                            borderLeftColor: labelColor,
                            borderLeftWidth: "3px",
                            borderLeftStyle: "solid"
                          } : undefined}
                        >
                          <span className="calendar-card-title">
                            {card.title}
                          </span>
                          {dueBadge && (
                            <span className={`calendar-card-due due-${dueBadge.tone}`} />
                          )}
                        </div>
                      );
                    })}
                    
                    {overflow > 0 && (
                      <div className="calendar-cell-more">
                        +{overflow} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Week view
          <div className="calendar-week">
            {/* All-day row */}
            <div className="calendar-week-allday">
              <div className="calendar-week-time-label">All day</div>
              <div className="calendar-week-allday-cells">
                {getWeekDays(currentDate).map((day, index) => {
                  const dayStr = day.toISOString().split("T")[0];
                  const isToday = new Date().toDateString() === day.toDateString();
                  const isWeekend = index >= 5;
                  
                  // Get all-day cards (cards without times) for this day
                  const allDayCards = cards.filter(card => {
                    if (card.due_date && !getTimeFromDate(card.due_date)) {
                      return card.due_date.startsWith(dayStr || "");
                    }
                    return false;
                  });
                  
                  return (
                    <div
                      key={index}
                      className={`calendar-week-allday-cell${isToday ? " calendar-week-today" : ""}${isWeekend ? " calendar-week-weekend" : ""}`}
                    >
                      {allDayCards.map(card => {
                        const dueBadge = getDueBadge(card.due_date);
                        const labelColor = card.labels[0]?.color;
                        
                        return (
                          <div
                            key={card.id}
                            className="calendar-week-card"
                            onClick={() => onCardClick(card)}
                            draggable
                            onDragStart={(e) => handleCardDragStart(e, card)}
                            onDragEnd={handleCardDragEnd}
                            title={`${card.title}\n${card.column_title}`}
                            style={labelColor ? {
                              borderLeftColor: labelColor,
                              borderLeftWidth: "3px",
                              borderLeftStyle: "solid"
                            } : undefined}
                          >
                            <span className="calendar-week-card-title">{card.title}</span>
                            {dueBadge && (
                              <span className={`calendar-card-due due-${dueBadge.tone}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Time grid */}
            <div className="calendar-week-grid">
              <div className="calendar-week-times">
                {TIME_SLOTS.map(time => (
                  <div key={time} className="calendar-week-time">
                    {time}
                  </div>
                ))}
              </div>
              
              <div className="calendar-week-columns">
                {getWeekDays(currentDate).map((day, dayIndex) => {
                  const dayStr = day.toISOString().split("T")[0];
                  const isToday = new Date().toDateString() === day.toDateString();
                  const isWeekend = dayIndex >= 5;
                  
                  return (
                    <div
                      key={dayIndex}
                      className={`calendar-week-column${isToday ? " calendar-week-today" : ""}${isWeekend ? " calendar-week-weekend" : ""}`}
                    >
                      {TIME_SLOTS.map((time, timeIndex) => {
                        const hour = parseInt(time.split(":")[0] || "0");
                        const minute = parseInt(time.split(":")[1] || "0");
                        
                        // Find cards scheduled at this time
                        const timeCards = cards.filter(card => {
                          if (!card.due_date || !card.due_date.startsWith(dayStr || "")) {
                            return false;
                          }
                          
                          const cardTime = getTimeFromDate(card.due_date);
                          if (!cardTime) return false;
                          
                          const timeParts = cardTime.split(":");
                          if (timeParts.length !== 2) return false;
                          
                          const cardHour = parseInt(timeParts[0] || "0");
                          const cardMinute = parseInt(timeParts[1] || "0");
                          
                          // Check if card starts in this 30-minute slot
                          return cardHour === hour && 
                            ((minute === 0 && cardMinute >= 0 && cardMinute < 30) ||
                             (minute === 30 && cardMinute >= 30 && cardMinute < 60));
                        });
                        
                        return (
                          <div
                            key={`${dayIndex}-${timeIndex}`}
                            className="calendar-week-slot"
                            onClick={(e) => handleSlotClick(e, dayStr || "", time)}
                            onDragOver={(e) => handleSlotDragOver(e, dayStr || "")}
                            onDragLeave={handleSlotDragLeave}
                            onDrop={(e) => handleSlotDrop(e, dayStr || "", time)}
                          >
                            {timeCards.map(card => {
                              const dueBadge = getDueBadge(card.due_date);
                              const labelColor = card.labels[0]?.color;
                              
                              // Calculate duration if both start and due times exist
                              let height = 50; // Default 30-min height
                              if (card.start_date && card.due_date && 
                                  card.start_date.split("T")[0] === card.due_date.split("T")[0]) {
                                const startTime = getTimeFromDate(card.start_date);
                                const endTime = getTimeFromDate(card.due_date);
                                
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
                              }
                              
                              return (
                                <div
                                  key={card.id}
                                  className="calendar-week-timed-card"
                                  onClick={() => onCardClick(card)}
                                  draggable
                                  onDragStart={(e) => handleCardDragStart(e, card)}
                                  onDragEnd={handleCardDragEnd}
                                  title={`${card.title}\n${card.column_title}\n${getTimeFromDate(card.due_date)}`}
                                  style={{
                                    height: `${height}px`,
                                    backgroundColor: labelColor || "#0079bf",
                                    borderLeftColor: labelColor || "#0079bf"
                                  }}
                                >
                                  <span className="calendar-week-card-time">
                                    {getTimeFromDate(card.due_date)}
                                  </span>
                                  <span className="calendar-week-card-title">{card.title}</span>
                                  {dueBadge && (
                                    <span className={`calendar-card-due due-${dueBadge.tone}`} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {!isLoading && !hasCardsWithDates && (
        <div className="calendar-empty">
          <p>No cards scheduled. Set due dates on cards or click a date to create one.</p>
        </div>
      )}
      
      <QuickCreatePopover
        show={quickCreateState.show}
        position={quickCreateState.position}
        columns={columns}
        prefilledDate={quickCreateState.prefilledDate}
        onClose={() => setQuickCreateState(prev => ({ ...prev, show: false }))}
        onCreate={handleQuickCreate}
      />
    </div>
  );
}