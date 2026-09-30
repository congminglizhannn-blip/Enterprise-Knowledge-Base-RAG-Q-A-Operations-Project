import type { ReactNode } from "react";

type RowActionsProps = {
  children: ReactNode;
  label?: string;
};

export function RowActions({ children, label = "行操作" }: RowActionsProps) {
  return (
    <div className="row-actions" role="group" aria-label={label}>
      {children}
    </div>
  );
}
