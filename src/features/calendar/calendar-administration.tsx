import { AlertTriangle, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  deleteCalendarDate,
  getCalendarRange,
  getScheduleManagement,
  saveCalendarDate,
  type CalendarAdministrationDate,
  type CalendarDateData,
} from '@/lib/api';

import {
  calendarCellSummary,
  emptyCalendarInput,
  formatCalendarDate,
  formatMonth,
  formatUpdatedAt,
  monthForDate,
  normalizeCalendarInput,
  shiftMonth,
  visibleMonthDates,
  type CalendarMonth,
} from './calendar-presentation';

const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function CalendarAdministration() {
  const [schoolToday, setSchoolToday] = useState<string | null>(null);
  const [month, setMonth] = useState<CalendarMonth | null>(null);
  const [dates, setDates] = useState<readonly CalendarAdministrationDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    void getScheduleManagement(controller.signal)
      .then((management) => {
        if (!controller.signal.aborted) {
          setSchoolToday(management.schoolDate);
          setMonth((current) => current ?? monthForDate(management.schoolDate));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('The school date could not be loaded.');
      });
    return () => controller.abort();
  }, []);

  const cells = useMemo(() => (month ? visibleMonthDates(month) : []), [month]);
  const range = cells.length
    ? { start: cells[0]!.date, end: cells[cells.length - 1]!.date }
    : null;

  useEffect(() => {
    if (!range) return;
    const id = ++requestId.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void getCalendarRange(range.start, range.end, controller.signal)
      .then((next) => {
        if (requestId.current === id) setDates(next.dates);
      })
      .catch((cause: unknown) => {
        if (!isAbort(cause) && requestId.current === id)
          setError(message(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId.current === id)
          setLoading(false);
      });
    return () => {
      controller.abort();
      requestId.current += 1;
    };
  }, [range?.end, range?.start, retry]);

  const configurations = useMemo(
    () => new Map(dates.map((date) => [date.date, date])),
    [dates],
  );
  const selected = selectedDate
    ? (configurations.get(selectedDate) ?? null)
    : null;
  const moveMonth = (amount: number) =>
    month && setMonth(shiftMonth(month, amount));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Calendar
        </p>
        <h1 className="mt-1 text-2xl font-bold">Calendar administration</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure explicit school-day attributes. Dates without a saved
          configuration use fallback behavior.
        </p>
      </div>
      <section
        className="border-border rounded-lg border bg-white"
        aria-label="School calendar"
      >
        <header className="border-border flex items-center justify-between gap-3 border-b p-4">
          <div className="flex items-center gap-1">
            <Button
              aria-label="Previous month"
              variant="secondary"
              size="icon"
              onClick={() => moveMonth(-1)}
              disabled={!month}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              aria-label="Next month"
              variant="secondary"
              size="icon"
              onClick={() => moveMonth(1)}
              disabled={!month}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <h2 className="text-lg font-bold">
            {month ? formatMonth(month) : 'Loading calendar…'}
          </h2>
          <Button
            variant="secondary"
            disabled={
              !schoolToday ||
              (month !== null &&
                monthForDate(schoolToday).year === month.year &&
                monthForDate(schoolToday).month === month.month)
            }
            onClick={() => schoolToday && setMonth(monthForDate(schoolToday))}
          >
            Today
          </Button>
        </header>
        {error && (
          <div
            className="border-danger/30 bg-danger-soft text-danger-dark m-4 rounded-lg border p-3 text-sm"
            role="alert"
          >
            {error}{' '}
            <Button
              className="ml-2"
              size="sm"
              variant="secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry
            </Button>
          </div>
        )}
        <div className="bg-muted/60 grid grid-cols-7 border-b">
          {weekdays.map((day) => (
            <div
              key={day}
              className="text-muted-foreground px-2 py-2 text-center text-xs font-semibold"
            >
              {day.slice(0, 3)}
              <span className="sr-only">{day.slice(3)}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7" aria-busy={loading}>
          {cells.map((cell) => (
            <CalendarDayButton
              key={cell.date}
              cell={cell}
              configured={configurations.get(cell.date)}
              onClick={() => setSelectedDate(cell.date)}
            />
          ))}
        </div>
        {loading && !dates.length && (
          <p className="text-muted-foreground p-5 text-center text-sm">
            Loading calendar dates…
          </p>
        )}
      </section>
      {selectedDate && (
        <CalendarDateDrawer
          key={selectedDate}
          date={selectedDate}
          configured={selected}
          onClose={() => setSelectedDate(null)}
          onSaved={(saved) => {
            setDates((current) => [
              ...current.filter((value) => value.date !== saved.date),
              saved,
            ]);
            setSelectedDate(null);
          }}
          onDeleted={(date) => {
            setDates((current) =>
              current.filter((value) => value.date !== date),
            );
            setSelectedDate(null);
          }}
        />
      )}
    </div>
  );
}

function CalendarDayButton({
  cell,
  configured,
  onClick,
}: {
  readonly cell: ReturnType<typeof visibleMonthDates>[number];
  readonly configured: CalendarAdministrationDate | undefined;
  readonly onClick: () => void;
}) {
  const tags = configured
    ? [
        configured.expectedDayType,
        !configured.isSchoolDay ? 'No School' : null,
        configured.isBlackoutDay ? 'Blackout' : null,
        configured.expectsSpecialSchedule ? 'Special' : null,
      ].filter(Boolean)
    : [];
  return (
    <button
      onClick={onClick}
      aria-label={calendarCellSummary(cell.date, configured)}
      className={`focus-visible:ring-brand/40 min-h-28 border-r border-b p-2 text-left focus-visible:z-10 focus-visible:ring-2 focus-visible:outline-none ${!cell.inMonth ? 'bg-muted/40 text-muted-foreground' : ''} ${!configured && !cell.weekend ? 'bg-muted/20 border-dashed' : ''} ${configured && !configured.isSchoolDay ? 'bg-muted/70 text-muted-foreground' : ''}`}
    >
      <span className="block text-sm font-semibold">
        {Number(cell.date.slice(8, 10))}
      </span>
      {configured ? (
        <>
          <div className="mt-1 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant={tag === 'A' || tag === 'B' ? 'success' : 'neutral'}
              >
                {tag}
              </Badge>
            ))}
            {configured.specialScheduleExpectedWarning && (
              <span
                className="text-warning-dark"
                title="Special Schedule expected, but no active Special Schedule is configured."
              >
                <AlertTriangle
                  className="size-4"
                  aria-label="Special Schedule warning"
                />
              </span>
            )}
          </div>
          {configured.label && (
            <p className="mt-1 truncate text-xs">{configured.label}</p>
          )}
        </>
      ) : !cell.weekend ? (
        <p className="mt-2 text-xs">Unconfigured</p>
      ) : null}
    </button>
  );
}

function CalendarDateDrawer({
  date,
  configured,
  onClose,
  onSaved,
  onDeleted,
}: {
  readonly date: string;
  readonly configured: CalendarAdministrationDate | null;
  readonly onClose: () => void;
  readonly onSaved: (saved: CalendarAdministrationDate) => void;
  readonly onDeleted: (date: string) => void;
}) {
  const [input, setInput] = useState<Omit<CalendarDateData, 'date'>>(() =>
    configured ? pickInput(configured) : emptyCalendarInput(),
  );
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identity = useRef(date);
  const update = (next: Partial<Omit<CalendarDateData, 'date'>>) =>
    setInput((current) => normalizeCalendarInput({ ...current, ...next }));
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveCalendarDate(date, normalizeCalendarInput(input));
      if (identity.current === saved.date) onSaved(saved);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (
      !window.confirm(
        `Remove explicit configuration for ${formatCalendarDate(date)}? The application will return to fallback calendar behavior for this date.`,
      )
    )
      return;
    setRemoving(true);
    setError(null);
    try {
      await deleteCalendarDate(date);
      if (identity.current === date) onDeleted(date);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setRemoving(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/25"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-drawer-title"
        className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl"
      >
        <header className="border-border sticky top-0 z-10 flex min-h-16 items-center justify-between border-b bg-white px-5">
          <div>
            <h2 id="calendar-drawer-title" className="text-lg font-bold">
              Calendar — {formatCalendarDate(date)}
            </h2>
            <p className="text-muted-foreground text-xs">
              {configured
                ? 'Configured'
                : 'Unconfigured — fallback behavior currently applies'}
            </p>
          </div>
          <button
            aria-label="Close calendar editor"
            className="hover:bg-muted focus-visible:ring-brand/40 rounded-md p-2 focus-visible:ring-2 focus-visible:outline-none"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="space-y-5 p-5">
          {configured && (
            <p className="text-muted-foreground text-xs">
              Last updated {formatUpdatedAt(configured.updatedAt)}
              {configured.updatedBy ? ` by ${configured.updatedBy}` : ''}
            </p>
          )}
          {error && (
            <p className="text-danger-dark text-sm" role="alert">
              {error}
            </p>
          )}
          <fieldset>
            <legend className="text-sm font-bold">School day</legend>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={input.isSchoolDay}
                onChange={(event) =>
                  update({ isSchoolDay: event.target.checked })
                }
              />{' '}
              School day
            </label>
          </fieldset>
          <fieldset
            disabled={!input.isSchoolDay}
            className="disabled:opacity-50"
          >
            <legend className="text-sm font-bold">A/B designation</legend>
            <div className="mt-2 flex gap-3 text-sm">
              {(['A', 'B', 'None'] as const).map((value) => (
                <label key={value} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="day-type"
                    checked={
                      input.expectedDayType ===
                      (value === 'None' ? null : value)
                    }
                    onChange={() =>
                      update({
                        expectedDayType: value === 'None' ? null : value,
                      })
                    }
                  />{' '}
                  {value}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-bold">
            <input
              className="mr-2"
              type="checkbox"
              disabled={!input.isSchoolDay}
              checked={input.isBlackoutDay}
              onChange={(event) =>
                update({ isBlackoutDay: event.target.checked })
              }
            />
            Blackout day
            <span className="text-muted-foreground mt-1 block text-xs font-normal">
              Blackout days remain school days but are tracked separately in
              absence reporting.
            </span>
          </label>
          <label className="block text-sm font-bold">
            <input
              className="mr-2"
              type="checkbox"
              disabled={!input.isSchoolDay}
              checked={input.expectsSpecialSchedule}
              onChange={(event) =>
                update({ expectsSpecialSchedule: event.target.checked })
              }
            />
            Special Schedule
          </label>
          {input.expectsSpecialSchedule && (
            <SpecialStatus configured={configured} />
          )}
          <label className="block text-sm font-bold">
            Label
            <input
              className="field mt-1"
              maxLength={240}
              value={input.label ?? ''}
              onChange={(event) =>
                update({ label: event.target.value || null })
              }
              placeholder="Optional label"
            />
          </label>
          <div className="flex flex-wrap justify-between gap-3 border-t pt-4">
            {configured ? (
              <Button
                variant="secondary"
                onClick={() => void remove()}
                disabled={saving || removing}
              >
                Remove configuration
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={saving || removing}
              >
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={saving || removing}>
                {saving
                  ? 'Saving…'
                  : configured
                    ? 'Save changes'
                    : 'Save configuration'}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SpecialStatus({
  configured,
}: {
  readonly configured: CalendarAdministrationDate | null;
}) {
  if (configured?.specialSchedule?.status === 'active')
    return (
      <p className="text-muted-foreground text-sm">
        Active Special Schedule: {configured.specialSchedule.name}
      </p>
    );
  if (configured?.specialSchedule)
    return (
      <p className="text-warning-dark flex gap-2 text-sm">
        <AlertTriangle className="size-4 shrink-0" />
        {configured.specialSchedule.name} is {configured.specialSchedule.status}
        ; it is not active.
      </p>
    );
  return (
    <p className="text-warning-dark flex gap-2 text-sm">
      <AlertTriangle className="size-4 shrink-0" />
      Special Schedule expected, but no active Special Schedule is configured
      for this date.
    </p>
  );
}

function pickInput(
  value: CalendarAdministrationDate,
): Omit<CalendarDateData, 'date'> {
  const {
    date: _date,
    sourceType: _sourceType,
    updatedAt: _updatedAt,
    updatedBy: _updatedBy,
    specialSchedule: _specialSchedule,
    specialScheduleExpectedWarning: _warning,
    ...input
  } = value;
  return input;
}
function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}
function message(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'The calendar request could not be completed.';
}
