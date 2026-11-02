/**
 * Display first-response durations while preserving hours, minutes and
 * seconds. The seconds component is rounded to one decimal place.
 */
export function formatFirstResponseDuration(minutes: number | null): string {
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

/** Keep the original compact dashboard format for every non-response metric. */
export function formatDashboardDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} s`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}
