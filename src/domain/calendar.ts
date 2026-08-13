const SCHOOL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_PATTERN = /^(\d{2}):(\d{2})$/;

export type SchoolDate = string & { readonly __schoolDate: unique symbol };
export type LocalTime = string & { readonly __localTime: unique symbol };

export function parseSchoolDate(value: string): SchoolDate {
  const match = SCHOOL_DATE_PATTERN.exec(value);
  if (!match) {
    throw new Error('School date must use YYYY-MM-DD.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = daysInCalendarMonth(year, month);

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    throw new Error('School date is not a valid calendar date.');
  }

  return value as SchoolDate;
}

function daysInCalendarMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return isLeapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseLocalTime(value: string): LocalTime {
  const match = LOCAL_TIME_PATTERN.exec(value);
  if (!match) {
    throw new Error('Schedule time must use 24-hour HH:MM.');
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new Error('Schedule time is outside the local school day clock.');
  }

  return value as LocalTime;
}

export function localTimeToMinutes(value: LocalTime): number {
  const hour = Number(value.slice(0, 2));
  const minute = Number(value.slice(3, 5));
  return hour * 60 + minute;
}

export function compareSchoolDates(
  left: SchoolDate,
  right: SchoolDate,
): number {
  return left.localeCompare(right);
}

export function compareLocalTimes(left: LocalTime, right: LocalTime): number {
  return localTimeToMinutes(left) - localTimeToMinutes(right);
}
