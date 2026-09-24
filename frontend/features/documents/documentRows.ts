import type { UploadRow } from "./types";

function timeValue(value?: string) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function sortUploadRows(rows: UploadRow[]) {
  return [...rows].sort((left, right) => {
    const timeDiff = timeValue(right.createdAt) - timeValue(left.createdAt);
    if (timeDiff !== 0) return timeDiff;
    return (right.id ?? "").localeCompare(left.id ?? "");
  });
}
