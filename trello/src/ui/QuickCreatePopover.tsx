import { useState, useEffect, useRef } from "react";
import type { Column } from "./api.ts";

interface QuickCreatePopoverProps {
  show: boolean;
  position: { x: number; y: number };
  columns: Column[];
  prefilledDate: string | null;
  onClose: () => void;
  onCreate: (title: string, columnId: string, dueDate: string | null) => void;
}

export function QuickCreatePopover({
  show,
  position,
  columns,
  prefilledDate,
  onClose,
  onCreate
}: QuickCreatePopoverProps): React.ReactElement | null {
  const [title, setTitle] = useState("");
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  
  // Set default column when columns change
  useEffect(() => {
    if (columns.length > 0 && !selectedColumnId) {
      setSelectedColumnId(columns[0]?.id || "");
    }
  }, [columns, selectedColumnId]);
  
  // Auto-focus title input when popover opens
  useEffect(() => {
    if (show && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [show]);
  
  // Handle clicks outside the popover
  useEffect(() => {
    if (!show) return;
    
    function handleClickOutside(event: MouseEvent): void {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [show, onClose]);
  
  // Handle Escape key
  useEffect(() => {
    if (!show) return;
    
    function handleEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [show, onClose]);
  
  if (!show) return null;
  
  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !selectedColumnId) return;
    
    setIsCreating(true);
    await onCreate(trimmedTitle, selectedColumnId, prefilledDate);
    
    // Reset form
    setTitle("");
    setIsCreating(false);
    onClose();
  }
  
  // Calculate popover position to keep it within viewport
  const popoverStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 320),
    top: Math.min(position.y, window.innerHeight - 200),
    zIndex: 1000
  };
  
  return (
    <div 
      ref={popoverRef}
      className="quick-create-popover"
      style={popoverStyle}
    >
      <form onSubmit={handleSubmit}>
        <div className="popover-field">
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Card title"
            className="popover-input"
            disabled={isCreating}
          />
        </div>
        
        <div className="popover-field">
          <select
            value={selectedColumnId}
            onChange={(e) => setSelectedColumnId(e.target.value)}
            className="popover-select"
            disabled={isCreating}
          >
            {columns.map(column => (
              <option key={column.id} value={column.id}>
                {column.title}
              </option>
            ))}
          </select>
        </div>
        
        {prefilledDate && (
          <div className="popover-date-info">
            <span className="popover-date-icon">📅</span>
            <span className="popover-date-text">
              {prefilledDate.includes("T") 
                ? new Date(prefilledDate).toLocaleString("en-US", { 
                    dateStyle: "medium", 
                    timeStyle: "short" 
                  })
                : new Date(prefilledDate + "T00:00").toLocaleDateString("en-US", { 
                    dateStyle: "medium" 
                  })
              }
            </span>
          </div>
        )}
        
        <button
          type="submit"
          className="btn-primary btn-sm"
          disabled={!title.trim() || isCreating}
        >
          {isCreating ? "Creating..." : "Create"}
        </button>
      </form>
    </div>
  );
}