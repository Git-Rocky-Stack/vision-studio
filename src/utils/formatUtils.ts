export function formatLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatTimestamp(value: string): string {
  const [date, time] = value.split('T');

  return time ? `${date} ${time.slice(0, 5)}` : value;
}