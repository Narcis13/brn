import { Card } from "./Card";
import type { Card as CardType, CardColumn } from "../../types";

interface ColumnProps {
  title: string;
  columnType: CardColumn;
  cards: CardType[];
  onCardUpdate?: () => void;
}

export function Column({ title, columnType, cards, onCardUpdate }: ColumnProps): JSX.Element {
  const sortedCards = [...cards].sort((a, b) => a.position - b.position);

  const getColumnStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      backgroundColor: "#f5f5f5",
      borderRadius: "8px",
      padding: "16px",
      minHeight: "400px",
      width: "100%",
    };

    return baseStyle;
  };

  const getHeaderStyle = (): React.CSSProperties => {
    const colors = {
      todo: "#4a90e2",
      doing: "#f5a623",
      done: "#7ed321",
    };

    return {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "16px",
      paddingBottom: "12px",
      borderBottom: `2px solid ${colors[columnType]}`,
    };
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    // Drag and drop will be implemented in next task
    console.log(`Dropped in ${columnType} column`);
  };

  return (
    <div 
      data-testid={`column-${columnType}`}
      style={getColumnStyle()}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div style={getHeaderStyle()}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>
          {title}
        </h3>
        <span 
          style={{
            backgroundColor: "#e0e0e0",
            color: "#666",
            padding: "2px 8px",
            borderRadius: "12px",
            fontSize: "12px",
            fontWeight: "500",
          }}
        >
          {cards.length}
        </span>
      </div>

      <div style={{ minHeight: "320px" }}>
        {sortedCards.length === 0 ? (
          <p style={{ 
            textAlign: "center", 
            color: "#999", 
            marginTop: "24px",
            fontSize: "14px",
          }}>
            No cards in {title}
          </p>
        ) : (
          sortedCards.map((card) => (
            <Card 
              key={card.id} 
              card={card} 
              onUpdate={onCardUpdate}
            />
          ))
        )}
      </div>
    </div>
  );
}