import {
  AlertTriangle,
  Check,
  FileSpreadsheet,
  Link2,
  Upload,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  activateScheduleImport,
  listRooms,
  listScheduleImports,
  listStaff,
  mapImportValue,
  uploadScheduleImport,
  type RoomData,
  type ScheduleImportDetail,
  type StaffData,
} from '@/lib/api';

export function ScheduleImportWorkspace() {
  const [imports, setImports] = useState<ScheduleImportDetail[]>([]);
  const [selected, setSelected] = useState<ScheduleImportDetail | null>(null);
  const [staff, setStaff] = useState<StaffData[]>([]);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState('2026-08-17');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [scheduleName, setScheduleName] = useState('Imported School Schedule');
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      listScheduleImports(),
      listStaff(controller.signal),
      listRooms(controller.signal),
    ])
      .then(([importValues, staffValues, roomValues]) => {
        setImports(importValues);
        setSelected(importValues[0] ?? null);
        setStaff(staffValues);
        setRooms(roomValues);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError')
          return;
        setError(message(cause));
      });
    return () => controller.abort();
  }, []);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setError('Choose the sanitized .xlsx workbook.');
    setBusy(true);
    setError(null);
    try {
      const result = await uploadScheduleImport({
        file,
        effectiveFrom,
        effectiveTo,
      });
      setSelected(result);
      setImports((values) => [
        result,
        ...values.filter((item) => item.id !== result.id),
      ]);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function map(
    kind: 'staff' | 'room',
    displayValue: string,
    createNew: boolean,
  ) {
    if (!selected) return;
    const key = `${kind}:${displayValue}`;
    setBusy(true);
    setError(null);
    try {
      const result = await mapImportValue(selected.id, {
        kind,
        displayValue,
        targetId: createNew ? undefined : targets[key],
        createNew,
      });
      setSelected(result);
      setImports((values) =>
        values.map((item) => (item.id === result.id ? result : item)),
      );
      if (createNew) {
        const [nextStaff, nextRooms] = await Promise.all([
          listStaff(),
          listRooms(),
        ]);
        setStaff(nextStaff);
        setRooms(nextRooms);
      }
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await activateScheduleImport(selected.id, scheduleName);
      setSelected(result);
      setImports((values) =>
        values.map((item) => (item.id === result.id ? result : item)),
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function createAllMissing() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      let result = selected;
      for (const mapping of selected.staffMappings.filter(
        (item) => !item.targetId,
      )) {
        result = await mapImportValue(selected.id, {
          kind: 'staff',
          displayValue: mapping.displayValue,
          createNew: true,
        });
      }
      for (const mapping of selected.roomMappings.filter(
        (item) => !item.targetId,
      )) {
        result = await mapImportValue(selected.id, {
          kind: 'room',
          displayValue: mapping.displayValue,
          createNew: true,
        });
      }
      setSelected(result);
      setImports((values) =>
        values.map((item) => (item.id === result.id ? result : item)),
      );
      const [nextStaff, nextRooms] = await Promise.all([
        listStaff(),
        listRooms(),
      ]);
      setStaff(nextStaff);
      setRooms(nextRooms);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="text-brand-dark size-6" />
          <h1 className="text-2xl font-bold tracking-tight">Schedule Import</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Receive → Parse → Stage → Validate → Map → Review → Activate
        </p>
      </header>

      {error && (
        <div
          className="border-danger/30 bg-danger-soft text-danger-dark rounded-md border px-3 py-2 text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      <section className="border-border rounded-lg border bg-white p-5">
        <h2 className="text-sm font-bold">Upload normal Schedule Version</h2>
        <form
          onSubmit={(event) => void upload(event)}
          className="mt-4 grid grid-cols-[1fr_170px_170px_auto] items-end gap-3"
        >
          <label className="text-muted-foreground text-xs font-semibold">
            Workbook (.xlsx)
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="field mt-1 block pt-1.5"
              required
            />
          </label>
          <label className="text-muted-foreground text-xs font-semibold">
            Effective From
            <input
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              className="field mt-1 block"
              required
            />
          </label>
          <label className="text-muted-foreground text-xs font-semibold">
            Effective To (optional)
            <input
              type="date"
              min={effectiveFrom}
              value={effectiveTo}
              onChange={(event) => setEffectiveTo(event.target.value)}
              className="field mt-1 block"
            />
          </label>
          <Button type="submit" disabled={busy}>
            <Upload className="size-4" /> Upload &amp; Validate
          </Button>
        </form>
      </section>

      {imports.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {imports.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item)}
              className={`border-border rounded-md border bg-white px-3 py-2 text-left text-xs ${selected?.id === item.id ? 'ring-brand ring-2' : ''}`}
            >
              <span className="block font-semibold">{item.sourceFileName}</span>
              <span className="text-muted-foreground">
                {item.effectiveFrom} · {item.status}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <section className="border-border overflow-hidden rounded-lg border bg-white">
          <div className="border-border flex items-center justify-between border-b px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold">Schedule validation</h2>
                <Badge>{selected.status}</Badge>
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {selected.sheetName} · {selected.entryCount} staged blocks ·
                SHA-256 {selected.sourceFileSha256.slice(0, 12)}…
              </p>
            </div>
            {selected.status === 'activated' && (
              <span className="text-brand-dark flex items-center gap-1 text-sm font-semibold">
                <Check className="size-4" /> Activated
              </span>
            )}
          </div>

          <div className="grid grid-cols-5 gap-3 p-5">
            <Result
              label="Staff recognized"
              value={selected.recognizedStaff}
              ok
            />
            <Result
              label="Rooms recognized"
              value={selected.recognizedRooms}
              ok
            />
            <Result
              label="A/B detected"
              value={selected.aBDetected ? 'Yes' : 'No'}
              ok={selected.aBDetected}
            />
            <Result
              label="Mappings required"
              value={selected.unmappedStaff + selected.unmappedRooms}
              ok={selected.unmappedStaff + selected.unmappedRooms === 0}
            />
            <Result
              label="Blocking errors"
              value={selected.blockingErrors}
              ok={selected.blockingErrors === 0}
            />
          </div>

          {(selected.unmappedStaff > 0 || selected.unmappedRooms > 0) && (
            <div className="border-border border-t p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold">
                    Persistent identity mapping
                  </h3>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Imported labels remain provenance values. Map each to a
                    stable record or create a fictional/local record.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void createAllMissing()}
                >
                  Create All Missing
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                {selected.staffMappings
                  .filter((mapping) => !mapping.targetId)
                  .map((mapping) => (
                    <MappingRow
                      key={`staff:${mapping.displayValue}`}
                      kind="staff"
                      displayValue={mapping.displayValue}
                      options={staff.map((person) => ({
                        id: person.id,
                        label: person.displayName,
                      }))}
                      target={targets[`staff:${mapping.displayValue}`] ?? ''}
                      busy={busy}
                      onTarget={(value) =>
                        setTargets((current) => ({
                          ...current,
                          [`staff:${mapping.displayValue}`]: value,
                        }))
                      }
                      onMap={() =>
                        void map('staff', mapping.displayValue, false)
                      }
                      onCreate={() =>
                        void map('staff', mapping.displayValue, true)
                      }
                    />
                  ))}
                {selected.roomMappings
                  .filter((mapping) => !mapping.targetId)
                  .map((mapping) => (
                    <MappingRow
                      key={`room:${mapping.displayValue}`}
                      kind="room"
                      displayValue={mapping.displayValue}
                      options={rooms.map((room) => ({
                        id: room.id,
                        label: room.name,
                      }))}
                      target={targets[`room:${mapping.displayValue}`] ?? ''}
                      busy={busy}
                      onTarget={(value) =>
                        setTargets((current) => ({
                          ...current,
                          [`room:${mapping.displayValue}`]: value,
                        }))
                      }
                      onMap={() =>
                        void map('room', mapping.displayValue, false)
                      }
                      onCreate={() =>
                        void map('room', mapping.displayValue, true)
                      }
                    />
                  ))}
              </div>
            </div>
          )}

          {selected.issues.length > 0 && (
            <div className="border-border border-t p-5">
              <h3 className="text-sm font-bold">Validation details</h3>
              <ul className="mt-2 space-y-1.5 text-xs">
                {selected.issues.map((issue, index) => (
                  <li
                    key={`${issue.code}:${index}`}
                    className={
                      issue.severity === 'error'
                        ? 'text-danger-dark'
                        : 'text-warning-dark'
                    }
                  >
                    <AlertTriangle className="mr-1 inline size-3.5" />{' '}
                    {issue.message} {issue.cell && `(${issue.cell})`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selected.status !== 'activated' && (
            <div className="border-border bg-muted/30 flex items-end justify-between gap-4 border-t p-5">
              <label className="text-muted-foreground w-80 text-xs font-semibold">
                Schedule Version name
                <input
                  value={scheduleName}
                  onChange={(event) => setScheduleName(event.target.value)}
                  className="field mt-1 block"
                />
              </label>
              <Button
                disabled={
                  busy ||
                  selected.blockingErrors > 0 ||
                  selected.unmappedStaff > 0 ||
                  selected.unmappedRooms > 0
                }
                onClick={() => void activate()}
              >
                <Check className="size-4" /> Activate Schedule Version
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MappingRow({
  kind,
  displayValue,
  options,
  target,
  busy,
  onTarget,
  onMap,
  onCreate,
}: {
  readonly kind: 'staff' | 'room';
  readonly displayValue: string;
  readonly options: readonly { id: string; label: string }[];
  readonly target: string;
  readonly busy: boolean;
  readonly onTarget: (value: string) => void;
  readonly onMap: () => void;
  readonly onCreate: () => void;
}) {
  return (
    <div className="border-border grid grid-cols-[220px_1fr_auto_auto] items-center gap-2 rounded-md border p-2.5">
      <div>
        <span className="block text-sm font-semibold">{displayValue}</span>
        <span className="text-muted-foreground text-xs">
          Imported {kind} value
        </span>
      </div>
      <select
        value={target}
        onChange={(event) => onTarget(event.target.value)}
        className="field"
      >
        <option value="">Choose existing {kind}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy || !target}
        onClick={onMap}
      >
        <Link2 className="size-3.5" /> Map
      </Button>
      <Button size="sm" disabled={busy} onClick={onCreate}>
        Create New
      </Button>
    </div>
  );
}

function Result({
  label,
  value,
  ok,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly ok: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${ok ? 'border-brand/20 bg-brand-soft' : 'border-warning/30 bg-warning-soft'}`}
    >
      <p className="text-muted-foreground text-xs font-semibold">{label}</p>
      <p
        className={`mt-1 text-lg font-bold ${ok ? 'text-brand-dark' : 'text-warning-dark'}`}
      >
        {value}
      </p>
    </div>
  );
}

function message(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'The request could not be completed.';
}
