import {
  compareLocalTimes,
  localTimeToMinutes,
  type LocalTime,
} from './calendar';

export interface TimeInterval {
  readonly start: LocalTime;
  readonly end: LocalTime;
}

export function createTimeInterval(
  start: LocalTime,
  end: LocalTime,
): TimeInterval {
  if (compareLocalTimes(start, end) >= 0) {
    throw new Error('A time interval must have start before end.');
  }

  return { start, end };
}

export function intervalsOverlap(
  left: TimeInterval,
  right: TimeInterval,
): boolean {
  return (
    compareLocalTimes(left.start, right.end) < 0 &&
    compareLocalTimes(right.start, left.end) < 0
  );
}

export function overlapMinutes(
  left: TimeInterval,
  right: TimeInterval,
): number {
  const start = Math.max(
    localTimeToMinutes(left.start),
    localTimeToMinutes(right.start),
  );
  const end = Math.min(
    localTimeToMinutes(left.end),
    localTimeToMinutes(right.end),
  );
  return Math.max(0, end - start);
}

export function intervalDurationMinutes(interval: TimeInterval): number {
  return localTimeToMinutes(interval.end) - localTimeToMinutes(interval.start);
}
