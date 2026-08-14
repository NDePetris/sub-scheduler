export function formatRoomLabel(room: string | null): string | null {
  const value = room?.trim();
  if (!value) return null;
  if (/^room\b/i.test(value)) return value;
  if (
    /^\d+[A-Za-z]?$/.test(value) ||
    /^[A-Z]{1,4}-\d+[A-Za-z]?$/.test(value) ||
    /^[A-Z]\d+[A-Za-z]?$/.test(value)
  )
    return `Room ${value}`;
  return value;
}
