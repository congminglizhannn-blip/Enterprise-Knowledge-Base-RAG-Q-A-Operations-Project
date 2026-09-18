import React from "react";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  className?: string;
};

export function EmptyState({ icon, title, description, className = "" }: EmptyStateProps) {
  return (
    <div className={`empty-table-state ${className}`}>
      {icon}
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  );
}
