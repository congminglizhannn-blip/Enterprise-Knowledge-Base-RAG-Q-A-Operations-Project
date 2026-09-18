export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return "-";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatCount(value: number | null | undefined, unit = ""): string {
  const count = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${count}${unit}`;
}
