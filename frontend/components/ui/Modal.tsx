import React from "react";

type ModalProps = {
  children: React.ReactNode;
  className?: string;
};

export function Modal({ children, className = "document-modal" }: ModalProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className={className}>{children}</section>
    </div>
  );
}
