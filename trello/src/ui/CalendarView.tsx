import { useState, useEffect, useCallback } from "react";
import type { BoardCard, Label } from "./api.ts";
import * as api from "./api.ts";
import { getDueBadge } from "./card-utils.ts";

interface CalendarViewProps {
  boardId: string;
  onCardClick: (card: BoardCard) => void;
}

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

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

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

export function CalendarView({ boardId, onCardClick }: CalendarViewProps): React.ReactElement {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [cards, setCards] = useState<CalendarCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const loadCalendarData = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    const { start, end } = formatDateRange(year, month);
    
    try {
      const response = await api.fetchCalendarCards(boardId, start, end);
      setCards(response.cards as CalendarCard[]);
    } finally {
      setIsLoading(false);
    }
  }, [boardId, year, month]);
  
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
  
  function navigateToToday(): void {
    setCurrentDate(new Date());
  }
  
  const monthGrid = getMonthGrid(year, month);
  
  monthGrid.forEach(cell => {
    cell.cards = cards.filter(card => {
      if (card.due_date && card.due_date.startsWith(cell.dateString)) {
        return true;
      }
      if (card.start_date && card.due_date) {
        const startDate = card.start_date.split("T")[0];
        const dueDate = card.due_date.split("T")[0];
        if (startDate && dueDate) {
          return cell.dateString >= startDate && cell.dateString <= dueDate;
        }
      }
      return false;
    });
  });
  
  const hasCardsWithDates = cards.length > 0;
  
  return (
    <div className="calendar-container">
      <div className="calendar-nav">
        <button 
          className="calendar-nav-btn"
          onClick={() => navigateMonth(-1)}
          title="Previous month"
        >
          &lt;
        </button>
        
        <h2 className="calendar-nav-title">
          {MONTHS[month]} {year}
        </h2>
        
        <button 
          className="calendar-nav-btn"
          onClick={() => navigateMonth(1)}
          title="Next month"
        >
          &gt;
        </button>
        
        <button 
          className="calendar-nav-today"
          onClick={navigateToToday}
        >
          Today
        </button>
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
              {Array.from({ length: 42 }, (_, i) => (
                <div key={i} className="calendar-cell skeleton-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <div className="calendar-body">
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
        )}
      </div>
      
      {!isLoading && !hasCardsWithDates && (
        <div className="calendar-empty">
          <p>No cards scheduled. Set due dates on cards or click a date to create one.</p>
        </div>
      )}
    </div>
  );
}