/**
 * Display analytics durations while preserving hours, minutes and seconds.
 * The seconds component is rounded to one decimal place.
 */
export function formatAnalyticsDuration(minutes: number | null): string {
  if (minutes === null) return '—';

  const totalSeconds = Math.max(0, minutes * 60);
  const hours = Math.floor(totalSeconds / 3_600);
  const remainingAfterHours = totalSeconds - hours * 3_600;
  const wholeMinutes = Math.floor(remainingAfterHours / 60);
  const seconds = remainingAfterHours - wholeMinutes * 60;
  const roundedSeconds = seconds.toFixed(1);

  if (hours > 0) {
    return `${hours}h ${wholeMinutes}m ${roundedSeconds}s`;
  }
  if (wholeMinutes > 0) {
    return `${wholeMinutes}m ${roundedSeconds}s`;
  }
  return `${roundedSeconds}s`;
}
