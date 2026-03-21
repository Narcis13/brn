import React from "react";

interface LoadingSpinnerProps {
  size?: number;
  color?: string;
  label?: string;
  style?: React.CSSProperties;
  testId?: string;
}

export function LoadingSpinner({
  size = 32,
  color = "#4a90e2",
  label = "Loading...",
  style,
  testId = "loading-spinner",
}: LoadingSpinnerProps): JSX.Element {
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    ...style,
  };

  const spinnerStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    border: `3px solid #e0e0e0`,
    borderTop: `3px solid ${color}`,
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  };

  const labelStyle: React.CSSProperties = {
    marginTop: "12px",
    fontSize: "14px",
    color: "#888",
  };

  return (
    <div data-testid={testId} style={containerStyle}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div
        data-testid="spinner-animation"
        style={spinnerStyle}
        role="status"
        aria-label={label}
      />
      {label && (
        <span data-testid="spinner-label" style={labelStyle}>
          {label}
        </span>
      )}
    </div>
  );
}
