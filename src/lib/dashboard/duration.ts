/**
 * Display analytics durations without collapsing them into a rounded unit.
 * Seconds keep millisecond precision and longer values preserve every unit.
 */
export function formatAnalyticsDuration(minutes: number | null): string {
  if (minutes === null) return '—';

  const totalSeconds = Math.max(0, minutes * 60);
  const hours = Math.floor(totalSeconds / 3_600);
  const remainingAfterHours = totalSeconds - hours * 3_600;
  const wholeMinutes = Math.floor(remainingAfterHours / 60);
  const seconds = remainingAfterHours - wholeMinutes * 60;
  const preciseSeconds = seconds
    .toFixed(3)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');

  if (hours > 0) {
    return `${hours}h ${wholeMinutes}m ${preciseSeconds}s`;
  }
  if (wholeMinutes > 0) {
    return `${wholeMinutes}m ${preciseSeconds}s`;
  }
  return `${preciseSeconds}s`;
}
