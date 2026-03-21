import React from "react";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  message: string;
  action?: EmptyStateAction;
  style?: React.CSSProperties;
  testId?: string;
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  style,
  testId = "empty-state",
}: EmptyStateProps): JSX.Element {
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "60px 24px",
    backgroundColor: "#f5f5f5",
    borderRadius: "8px",
    ...style,
  };

  const iconStyle: React.CSSProperties = {
    fontSize: "48px",
    marginBottom: "16px",
    lineHeight: "1",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: "20px",
    fontWeight: "600",
    color: "#444",
    margin: "0 0 8px 0",
  };

  const messageStyle: React.CSSProperties = {
    fontSize: "14px",
    color: "#888",
    margin: "0 0 24px 0",
    maxWidth: "320px",
  };

  const actionButtonStyle: React.CSSProperties = {
    padding: "10px 20px",
    backgroundColor: "#4a90e2",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "500",
    cursor: "pointer",
  };

  return (
    <div data-testid={testId} style={containerStyle}>
      {icon && (
        <div data-testid="empty-state-icon" style={iconStyle}>
          {icon}
        </div>
      )}
      <h2 data-testid="empty-state-title" style={titleStyle}>
        {title}
      </h2>
      <p data-testid="empty-state-message" style={messageStyle}>
        {message}
      </p>
      {action && (
        <button
          data-testid="empty-state-action"
          style={actionButtonStyle}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
