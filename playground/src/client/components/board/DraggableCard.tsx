import React, { useState } from "react";
import type { Card as CardType } from "../../types";
import { Card } from "./Card";

interface DraggableCardProps {
  card: CardType;
  onUpdate: () => void;
  onDragStart?: (card: CardType) => void;
  onDragEnd?: () => void;
  isDragTarget?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}

export function DraggableCard({ 
  card, 
  onUpdate, 
  onDragStart,
  onDragEnd,
  isDragTarget = false,
  disabled = false,
  className = "",
  onClick
}: DraggableCardProps): JSX.Element {
  const [showDropIndicator, setShowDropIndicator] = useState(false);
  const [isTouchDragging, setIsTouchDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>): void => {
    if (disabled) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("cardId", card.id);
    e.dataTransfer.setData("sourceColumn", card.column);
    
    // Set drag image opacity
    if (e.currentTarget) {
      e.currentTarget.style.opacity = "0.5";
    }

    if (onDragStart) {
      onDragStart(card);
    }
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>): void => {
    // Reset opacity
    if (e.currentTarget) {
      e.currentTarget.style.opacity = "1";
    }

    if (onDragEnd) {
      onDragEnd();
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setShowDropIndicator(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setShowDropIndicator(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>): void => {
    if (!disabled) {
      setIsTouchDragging(true);
    }
  };

  const handleTouchEnd = (): void => {
    setIsTouchDragging(false);
  };

  return (
    <div
      data-testid={`card-${card.id}`}
      className={`draggable-card-wrapper ${className} ${isTouchDragging ? 'touch-dragging' : ''}`}
      style={{ position: "relative" }}
    >
      {showDropIndicator && (
        <div
          data-testid="drop-indicator"
          className={`drop-indicator ${showDropIndicator ? 'drop-indicator-active' : ''}`}
          style={{
            position: "absolute",
            top: "-4px",
            left: 0,
            right: 0,
            height: "3px",
            backgroundColor: "#0969da",
            borderRadius: "2px",
            opacity: showDropIndicator ? 1 : 0,
            transition: "opacity 0.2s ease",
          }}
        />
      )}
      
      <div
        draggable={!disabled}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={onClick}
        style={{
          cursor: disabled ? "default" : "move",
        }}
      >
        <Card card={card} onUpdate={onUpdate} />
      </div>
    </div>
  );
}