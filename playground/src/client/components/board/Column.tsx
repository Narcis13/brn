import { DraggableCard } from "./DraggableCard";
import { CreateCard } from "./CreateCard";
import { EmptyState } from "../common/EmptyState";
import type { Card as CardType, CardColumn } from "../../types";

interface ColumnProps {
  title: string;
  columnType: CardColumn;
  cards: CardType[];
  boardId?: string;
  onCardUpdate?: () => void;
  onCardDragStart?: (card: CardType) => void;
  onCardDragEnd?: () => void;
  onCardDrop?: (targetColumn: CardColumn, targetCard: CardType | null) => Promise<void>;
  isDragActive?: boolean;
  draggedCard?: CardType | null;
}

export function Column({
  title,
  columnType,
  cards,
  boardId,
  onCardUpdate,
  onCardDragStart,
  onCardDragEnd,
  onCardDrop,
  isDragActive = false,
  draggedCard = null
}: ColumnProps): JSX.Element {
  const sortedCards = [...cards].sort((a, b) => a.position - b.position);

  const getColumnStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      backgroundColor: "#f5f5f5",
      borderRadius: "8px",
      padding: "16px",
      minHeight: "400px",
      width: "100%",
      transition: "all 0.2s ease",
    };

    // Highlight column when dragging over it
    if (isDragActive && draggedCard?.column !== columnType) {
      baseStyle.backgroundColor = "#e3f2fd";
      baseStyle.boxShadow = "0 0 0 2px #2196f3";
    }

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

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault();

    if (onCardDrop) {
      // Dropping at the end of the column
      await onCardDrop(columnType, null);
    }
  };

  const handleCardDrop = async (targetCard: CardType): Promise<void> => {
    if (onCardDrop) {
      await onCardDrop(columnType, targetCard);
    }
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
          <EmptyState
            title={`No cards in ${title}`}
            message="Add a card to this column"
            testId={`column-${columnType}-empty`}
            style={{ padding: "24px", backgroundColor: "transparent" }}
          />
        ) : (
          sortedCards.map((card) => (
            <div
              key={card.id}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCardDrop(card);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <DraggableCard
                card={card}
                onUpdate={onCardUpdate || (() => {})}
                onDragStart={onCardDragStart}
                onDragEnd={onCardDragEnd}
                disabled={false}
              />
            </div>
          ))
        )}

        {boardId && (
          <CreateCard
            boardId={boardId}
            column={columnType}
            position={sortedCards.length}
            onCardCreated={onCardUpdate || (() => {})}
          />
        )}
      </div>
    </div>
  );
}
