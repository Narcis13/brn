import type { Card as CardType } from "../../types";

interface CardProps {
  card: CardType;
  onUpdate?: () => void;
}

export function Card({ card, onUpdate }: CardProps): JSX.Element {
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      return "just now";
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getCardClassName = (): string => {
    const baseClasses = "card";
    const columnClass = card.column;
    return `${baseClasses} ${columnClass}`;
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>): void => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("cardId", card.id);
    e.dataTransfer.setData("sourceColumn", card.column);
    // Set drag image opacity
    if (e.currentTarget) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>): void => {
    // Reset opacity
    if (e.currentTarget) {
      e.currentTarget.style.opacity = "1";
    }
  };

  const handleClick = (): void => {
    // For now, just log - in a real app, this would open a detail view
    console.log("Card clicked:", card.id);
    if (onUpdate) {
      // Could trigger update here
    }
  };

  return (
    <div 
      data-testid={`card-${card.id}`}
      className={getCardClassName()}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      style={{
        backgroundColor: "#fff",
        borderRadius: "8px",
        padding: "12px",
        marginBottom: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)",
        cursor: "pointer",
        transition: "all 0.2s ease",
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: "600" }}>
        {card.title}
      </h4>
      
      {card.description && (
        <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#666", lineHeight: "1.4" }}>
          {card.description}
        </p>
      )}
      
      <div style={{ fontSize: "11px", color: "#999" }}>
        <time dateTime={card.updatedAt} title={card.updatedAt}>
          {formatDate(card.updatedAt)}
        </time>
      </div>
    </div>
  );
}