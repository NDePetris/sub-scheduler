import {
  AlertTriangle,
  Archive,
  Check,
  FileSpreadsheet,
  Link2,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  activateScheduleImport,
  archiveSchedule,
  configureSchedule,
  deleteSchedule,
  deleteScheduleImport,
  getScheduleManagement,
  listRooms,
  listScheduleImports,
  listStaff,
  mapImportValue,
  previewScheduleActivation,
  uploadScheduleImport,
  type ActivationPreview,
  type RoomData,
  type ScheduleImportDetail,
  type ScheduleManagementData,
  type ScheduleVersionSummary,
  type StaffData,
} from '@/lib/api';

export function ScheduleImportWorkspace() {
  const [management, setManagement] = useState<ScheduleManagementData | null>(
    null,
  );
  const [imports, setImports] = useState<ScheduleImportDetail[]>([]);
  const [selected, setSelected] = useState<ScheduleImportDetail | null>(null);
  const [staff, setStaff] = useState<StaffData[]>([]);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [configure, setConfigure] = useState<ScheduleVersionSummary | null>(
    null,
  );
  const [activationPreview, setActivationPreview] =
    useState<ActivationPreview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [effectiveFrom, setEffectiveFrom] = useState('2026-08-17');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [scheduleName, setScheduleName] = useState('Imported School Schedule');
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setError(null);
    try {
      const [scheduleData, importValues, staffValues, roomValues] =
        await Promise.all([
          getScheduleManagement(),
          listScheduleImports(),
          listStaff(),
          listRooms(),
        ]);
      setManagement(scheduleData);
      setImports(importValues);
      setStaff(staffValues);
      setRooms(roomValues);
    } catch (cause) {
      setError(message(cause));
    }
  }

  function clearFile() {
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setError('Choose an .xlsx workbook.');
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
      setScheduleName(file.name.replace(/\.xlsx$/i, '') || 'Imported Schedule');
      clearFile();
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
    await run(async () => {
      const result = await mapImportValue(selected.id, {
        kind,
        displayValue,
        targetId: createNew ? undefined : targets[key],
        createNew,
      });
      replaceImport(result);
      if (createNew) {
        const [nextStaff, nextRooms] = await Promise.all([
          listStaff(),
          listRooms(),
        ]);
        setStaff(nextStaff);
        setRooms(nextRooms);
      }
    });
  }

  async function createAllMissing() {
    if (!selected) return;
    await run(async () => {
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
      replaceImport(result);
      const [nextStaff, nextRooms] = await Promise.all([
        listStaff(),
        listRooms(),
      ]);
      setStaff(nextStaff);
      setRooms(nextRooms);
    });
  }

  async function beginActivation() {
    if (!selected) return;
    await run(async () => {
      const preview = await previewScheduleActivation(selected.id);
      if (preview.action === 'close_predecessor') {
        setActivationPreview(preview);
      } else {
        await completeActivation(false);
      }
    });
  }

  async function completeActivation(confirmPredecessorClosure: boolean) {
    if (!selected) return;
    await run(async () => {
      await activateScheduleImport(
        selected.id,
        scheduleName,
        confirmPredecessorClosure,
      );
      setActivationPreview(null);
      setSelected(null);
      setShowImport(false);
      await loadAll();
    });
  }

  async function removeImport(item: ScheduleImportDetail) {
    if (!window.confirm(`Delete staged import ${item.sourceFileName}?`)) return;
    await run(async () => {
      await deleteScheduleImport(item.id);
      setImports((values) => values.filter((value) => value.id !== item.id));
      if (selected?.id === item.id) setSelected(null);
    });
  }

  async function removeVersion(item: ScheduleVersionSummary) {
    if (
      !window.confirm(
        `Permanently delete ${item.name}, its ${item.entryCount} Schedule Entries, and related import metadata? Staff and Rooms will not be deleted.`,
      )
    )
      return;
    await run(async () => setManagement(await deleteSchedule(item.id)));
  }

  async function archiveVersion(item: ScheduleVersionSummary) {
    if (
      !window.confirm(
        `${item.name} is referenced by historical Sub Plans. Archive it so it no longer participates in normal schedule resolution while preserving those plans?`,
      )
    )
      return;
    await run(async () => setManagement(await archiveSchedule(item.id)));
  }

  function replaceImport(result: ScheduleImportDetail) {
    setSelected(result);
    setImports((values) =>
      values.map((item) => (item.id === result.id ? result : item)),
    );
  }

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  const staged = imports.filter((item) => item.status !== 'activated');

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Understand which normal or one-day schedule applies, then manage
            imports and effective dates safely.
          </p>
        </div>
        <Button onClick={() => setShowImport((value) => !value)}>
          <Upload className="size-4" /> Import Schedule
        </Button>
      </header>

      {error && <ErrorBanner message={error} />}

      {showImport && (
        <section className="border-brand/30 overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="border-border flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-bold">Import Schedule</h2>
              <p className="text-muted-foreground text-xs">
                Receive â†’ Parse â†’ Stage â†’ Validate â†’ Map â†’ Review â†’
                Activate
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close import workflow"
              onClick={() => setShowImport(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <form
            onSubmit={(event) => void upload(event)}
            className="grid grid-cols-[1fr_170px_170px_auto] items-end gap-3 p-5"
          >
            <label className="text-muted-foreground text-xs font-semibold">
              Workbook (.xlsx)
              <span className="border-border hover:border-brand mt-1 flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed bg-white px-3 text-sm">
                <FileSpreadsheet className="text-brand-dark size-4" />
                <span className="text-foreground min-w-0 flex-1 truncate">
                  {file?.name ?? 'Choose workbook'}
                </span>
                {file && (
                  <button
                    type="button"
                    aria-label="Clear selected workbook"
                    onClick={(event) => {
                      event.preventDefault();
                      clearFile();
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </span>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="sr-only"
              />
            </label>
            <Labeled label="Effective From">
              <input
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                className="field"
                required
              />
            </Labeled>
            <Labeled label="Effective To (optional)">
              <input
                type="date"
                min={effectiveFrom}
                value={effectiveTo}
                onChange={(event) => setEffectiveTo(event.target.value)}
                className="field"
              />
            </Labeled>
            <Button type="submit" disabled={busy || !file}>
              Upload &amp; Validate
            </Button>
          </form>
          {selected && selected.status !== 'activated' && (
            <Configuration
              selected={selected}
              staff={staff}
              rooms={rooms}
              targets={targets}
              scheduleName={scheduleName}
              busy={busy}
              onName={setScheduleName}
              onTarget={(key, value) =>
                setTargets((current) => ({ ...current, [key]: value }))
              }
              onMap={map}
              onCreateAll={createAllMissing}
              onActivate={beginActivation}
            />
          )}
        </section>
      )}

      <section className="border-border overflow-hidden rounded-lg border bg-white">
        <div className="border-border border-b px-5 py-4">
          <h2 className="font-bold">Normal Schedule Versions</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Status is derived for school date {management?.schoolDate ?? 'â€¦'}.
            Existing Sub Plans remain pinned when these ranges change.
          </p>
        </div>
        <ScheduleTable
          items={management?.scheduleVersions ?? []}
          onConfigure={setConfigure}
          onDelete={(item) => void removeVersion(item)}
          onArchive={(item) => void archiveVersion(item)}
        />
      </section>

      <section className="border-border overflow-hidden rounded-lg border bg-white">
        <div className="border-border border-b px-5 py-4">
          <h2 className="font-bold">Staged Imports</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Unactivated workbooks are separate from Schedule Versions and may be
            resumed or deleted.
          </p>
        </div>
        {staged.length === 0 ? (
          <Empty>No staged imports.</Empty>
        ) : (
          <div className="divide-border divide-y">
            {staged.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_210px_170px_auto] items-center gap-4 px-5 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold">{item.sourceFileName}</p>
                  <p className="text-muted-foreground text-xs">
                    Imported {formatDateTime(item.createdAt)} Â·{' '}
                    {item.entryCount} blocks
                  </p>
                </div>
                <span>
                  {formatDate(item.effectiveFrom)} â†’{' '}
                  {item.effectiveTo
                    ? formatDate(item.effectiveTo)
                    : 'Open-ended'}
                </span>
                <div className="flex gap-2">
                  <Badge>{item.status}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {item.unmappedStaff + item.unmappedRooms} mappings
                  </span>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSelected(item);
                      setShowImport(true);
                    }}
                  >
                    Resume Configuration
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${item.sourceFileName}`}
                    onClick={() => void removeImport(item)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border-border overflow-hidden rounded-lg border bg-white">
        <div className="border-border border-b px-5 py-4">
          <h2 className="font-bold">Special Schedules</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Special Schedules override the normal Schedule Version for one
            specific date. The normal schedule resumes the next school day.
          </p>
        </div>
        {!management?.specialSchedules.length ? (
          <Empty>No Special Schedules configured.</Empty>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th className="px-5 py-2.5">Date</th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Source</th>
                <th className="px-5 py-2.5 text-right">Context</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {management.specialSchedules.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3 font-semibold">
                    {formatDate(item.date)}
                  </td>
                  <td className="px-3 py-3">{item.name}</td>
                  <td className="px-3 py-3 capitalize">
                    <Badge>{item.status}</Badge>
                  </td>
                  <td className="text-muted-foreground px-3 py-3">
                    {item.sourceFileName ?? 'â€”'}
                  </td>
                  <td className="text-muted-foreground px-5 py-3 text-right text-xs">
                    {item.entryCount} blocks Â· {item.planReferenceCount} Sub
                    Plans
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {configure && (
        <ConfigureDialog
          item={configure}
          busy={busy}
          onClose={() => setConfigure(null)}
          onSave={(input) =>
            void run(async () => {
              setManagement(await configureSchedule(configure.id, input));
              setConfigure(null);
            })
          }
        />
      )}

      {activationPreview?.predecessor && (
        <Modal
          title="Activate new Schedule Version?"
          onClose={() => setActivationPreview(null)}
        >
          <p className="text-sm leading-6">
            <strong>{activationPreview.predecessor.name}</strong> is currently
            open-ended. Activating <strong>{scheduleName}</strong> beginning{' '}
            {formatDate(selected?.effectiveFrom ?? '')} will end{' '}
            {activationPreview.predecessor.name} on{' '}
            {formatDate(activationPreview.predecessor.proposedEffectiveTo)}.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setActivationPreview(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => void completeActivation(true)}
            >
              Activate &amp; End Previous Schedule
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ScheduleTable({
  items,
  onConfigure,
  onDelete,
  onArchive,
}: {
  readonly items: readonly ScheduleVersionSummary[];
  readonly onConfigure: (item: ScheduleVersionSummary) => void;
  readonly onDelete: (item: ScheduleVersionSummary) => void;
  readonly onArchive: (item: ScheduleVersionSummary) => void;
}) {
  if (items.length === 0) return <Empty>No activated Schedule Versions.</Empty>;
  return (
    <table className="w-full text-left text-sm">
      <thead className="bg-muted/50 text-muted-foreground text-xs">
        <tr>
          <th className="px-5 py-2.5">Schedule</th>
          <th className="px-3 py-2.5">Effective From</th>
          <th className="px-3 py-2.5">Effective To</th>
          <th className="px-3 py-2.5">Status</th>
          <th className="px-3 py-2.5">Source</th>
          <th className="px-5 py-2.5 text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-border divide-y">
        {items.map((item) => (
          <tr
            key={item.id}
            className={item.status === 'archived' ? 'bg-muted/30' : ''}
          >
            <td className="px-5 py-3">
              <p className="font-semibold">{item.name}</p>
              <p className="text-muted-foreground text-xs">
                {item.entryCount} blocks Â· {item.planReferenceCount} pinned Sub
                Plans
              </p>
            </td>
            <td className="px-3 py-3">{formatDate(item.effectiveFrom)}</td>
            <td className="px-3 py-3">
              {item.effectiveTo ? formatDate(item.effectiveTo) : 'â€”'}
            </td>
            <td className="px-3 py-3 capitalize">
              <Badge className={statusClass(item.status)}>{item.status}</Badge>
            </td>
            <td className="text-muted-foreground px-3 py-3">
              {item.sourceFileName ?? 'â€”'}
            </td>
            <td className="px-5 py-3">
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onConfigure(item)}
                >
                  <Settings2 className="size-3.5" /> Configure
                </Button>
                {item.status !== 'archived' &&
                  (item.canDelete ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(item)}
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onArchive(item)}
                    >
                      <Archive className="size-3.5" /> Archive
                    </Button>
                  ))}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Configuration({
  selected,
  staff,
  rooms,
  targets,
  scheduleName,
  busy,
  onName,
  onTarget,
  onMap,
  onCreateAll,
  onActivate,
}: {
  readonly selected: ScheduleImportDetail;
  readonly staff: readonly StaffData[];
  readonly rooms: readonly RoomData[];
  readonly targets: Readonly<Record<string, string>>;
  readonly scheduleName: string;
  readonly busy: boolean;
  readonly onName: (value: string) => void;
  readonly onTarget: (key: string, value: string) => void;
  readonly onMap: (
    kind: 'staff' | 'room',
    displayValue: string,
    createNew: boolean,
  ) => Promise<void>;
  readonly onCreateAll: () => Promise<void>;
  readonly onActivate: () => Promise<void>;
}) {
  const missing = selected.unmappedStaff + selected.unmappedRooms;
  return (
    <div className="border-border border-t">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-bold">Schedule Configuration</h2>
            <Badge>{selected.status}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {selected.sourceFileName} Â· {selected.sheetName} Â·{' '}
            {selected.entryCount} staged blocks Â·{' '}
            {formatDate(selected.effectiveFrom)} â†’{' '}
            {selected.effectiveTo
              ? formatDate(selected.effectiveTo)
              : 'Open-ended'}
          </p>
        </div>
        {missing > 0 && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void onCreateAll()}
          >
            Create All Missing
          </Button>
        )}
      </div>
      <div className="grid grid-cols-5 gap-3 px-5 pb-5">
        <Result label="Staff recognized" value={selected.recognizedStaff} ok />
        <Result label="Rooms recognized" value={selected.recognizedRooms} ok />
        <Result
          label="A/B detected"
          value={selected.aBDetected ? 'Yes' : 'No'}
          ok={selected.aBDetected}
        />
        <Result label="Mappings required" value={missing} ok={missing === 0} />
        <Result
          label="Blocking errors"
          value={selected.blockingErrors}
          ok={selected.blockingErrors === 0}
        />
      </div>
      {missing > 0 && (
        <div className="border-border space-y-2 border-t p-5">
          <h3 className="text-sm font-bold">Persistent identity mapping</h3>
          {selected.staffMappings
            .filter((item) => !item.targetId)
            .map((item) => (
              <MappingRow
                key={`staff:${item.displayValue}`}
                kind="staff"
                displayValue={item.displayValue}
                options={staff.map((person) => ({
                  id: person.id,
                  label: person.displayName,
                }))}
                target={targets[`staff:${item.displayValue}`] ?? ''}
                busy={busy}
                onTarget={(value) =>
                  onTarget(`staff:${item.displayValue}`, value)
                }
                onMap={() => void onMap('staff', item.displayValue, false)}
                onCreate={() => void onMap('staff', item.displayValue, true)}
              />
            ))}
          {selected.roomMappings
            .filter((item) => !item.targetId)
            .map((item) => (
              <MappingRow
                key={`room:${item.displayValue}`}
                kind="room"
                displayValue={item.displayValue}
                options={rooms.map((room) => ({
                  id: room.id,
                  label: room.name,
                }))}
                target={targets[`room:${item.displayValue}`] ?? ''}
                busy={busy}
                onTarget={(value) =>
                  onTarget(`room:${item.displayValue}`, value)
                }
                onMap={() => void onMap('room', item.displayValue, false)}
                onCreate={() => void onMap('room', item.displayValue, true)}
              />
            ))}
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
      <div className="border-border bg-muted/30 flex items-end justify-between gap-4 border-t p-5">
        <Labeled label="Schedule Version name">
          <input
            value={scheduleName}
            onChange={(event) => onName(event.target.value)}
            className="field w-80"
          />
        </Labeled>
        <Button
          disabled={busy || selected.blockingErrors > 0 || missing > 0}
          onClick={() => void onActivate()}
        >
          <Check className="size-4" /> Activate Schedule Version
        </Button>
      </div>
    </div>
  );
}

function ConfigureDialog({
  item,
  busy,
  onClose,
  onSave,
}: {
  readonly item: ScheduleVersionSummary;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSave: (input: {
    name: string;
    effectiveFrom: string;
    effectiveTo: string | null;
  }) => void;
}) {
  const [name, setName] = useState(item.name);
  const [from, setFrom] = useState(item.effectiveFrom);
  const [to, setTo] = useState(item.effectiveTo ?? '');
  return (
    <Modal title="Configure Schedule Version" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ name, effectiveFrom: from, effectiveTo: to || null });
        }}
        className="space-y-4"
      >
        <p className="text-muted-foreground text-sm">
          Date changes affect future or uncreated Sub Plans only.{' '}
          {item.planReferenceCount} existing Sub Plan
          {item.planReferenceCount === 1 ? '' : 's'} will remain pinned.
        </p>
        <Labeled label="Schedule Version name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="field"
            required
          />
        </Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Effective From">
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="field"
              required
            />
          </Labeled>
          <Labeled label="Effective To (optional)">
            <input
              type="date"
              min={from}
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="field"
            />
          </Labeled>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Save Configuration
          </Button>
        </div>
      </form>
    </Modal>
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

function Modal({
  title,
  onClose,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        className="border-border w-full max-w-xl rounded-xl border bg-white shadow-xl"
      >
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-bold">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="text-muted-foreground block text-xs font-semibold">
      {label}
      <span className="text-foreground mt-1 block">{children}</span>
    </label>
  );
}

function ErrorBanner({ message: value }: { readonly message: string }) {
  return (
    <div
      className="border-danger/30 bg-danger-soft text-danger-dark rounded-md border px-3 py-2 text-sm"
      role="alert"
    >
      {value}
    </div>
  );
}

function Empty({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground px-5 py-8 text-center text-sm">
      {children}
    </div>
  );
}

function statusClass(status: ScheduleVersionSummary['status']): string {
  if (status === 'current')
    return 'border-brand/30 bg-brand-soft text-brand-dark';
  if (status === 'future') return 'border-sky-200 bg-sky-50 text-sky-900';
  if (status === 'archived')
    return 'border-slate-300 bg-slate-100 text-slate-700';
  return '';
}

function formatDate(value: string): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function message(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'The request could not be completed.';
}
