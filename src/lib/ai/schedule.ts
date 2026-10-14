import type { AiActiveSchedule } from './agent-schema';

interface AiScheduleCheck {
  schedule: AiActiveSchedule;
  timezone: string;
  at?: Date;
}

/**
 * Controls only automatic customer replies. Drafts and other tools remain
 * available to the team outside the selected schedule.
 */
export function isAutomaticAiActiveAt({
  schedule,
  timezone,
  at = new Date(),
}: AiScheduleCheck): boolean {
  if (schedule === 'always') return true;

  try {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).format(at);
    return weekday === 'Sat' || weekday === 'Sun';
  } catch {
    // A custom schedule must fail closed when its timezone is invalid.
    return false;
  }
}
