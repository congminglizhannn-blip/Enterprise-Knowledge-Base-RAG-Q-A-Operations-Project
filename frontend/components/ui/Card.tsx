import React from "react";

type CardProps = {
  title: string;
  children: React.ReactNode;
  className?: string;
};

export function Card({ title, children, className = "" }: CardProps) {
  return (
    <section className={`card ${className}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
