import { addDays, dayKey, formatTime, isDayKey, startOfDay } from "./dates";

const LOCAL_INPUT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

// A datetime-local value ("2026-11-16T23:59") read in the teacher's timezone. Null if malformed.
export function localInputToDate(value: string, timeZone: string): Date | null {
  const match = LOCAL_INPUT.exec(value);
  if (!match || !isDayKey(match[1])) return null;
  const wanted = Number(match[2]) * 60 + Number(match[3]);
  if (wanted >= 24 * 60) return null;
  const guess = new Date(startOfDay(match[1], timeZone).getTime() + wanted * 60_000);
  // Midnight plus minutes is an hour out on a day when the clocks change.
  const drift = wanted - minutesOf(formatTime(guess, timeZone));
  return new Date(guess.getTime() + drift * 60_000);
}

export function dateToLocalInput(date: Date, timeZone: string) {
  return `${dayKey(date, timeZone)}T${formatTime(date, timeZone)}`;
}

// What the due date field starts with: a week from today, at the end of the day.
export function defaultDueInput(now: Date, timeZone: string) {
  return `${addDays(dayKey(now, timeZone), 7)}T23:59`;
}
