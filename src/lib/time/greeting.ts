export function getChileGreeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now)
  );

  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
