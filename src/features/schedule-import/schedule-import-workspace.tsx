import {
  AlertTriangle,
  Archive,
  Check,
  FileSpreadsheet,
  Link2,
  LoaderCircle,
  Plus,
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
  activateSpecialScheduleImport,
  archiveSchedule,
  archiveSpecialSchedule,
  configureScheduleImport,
  configureSchedule,
  configureSpecialSchedule,
  deleteSchedule,
  deleteScheduleImport,
  deleteSpecialSchedule,
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
  type SpecialScheduleSummary,
  type StaffData,
} from '@/lib/api';

interface Confirmation {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly action: () => Promise<void>;
}

interface BulkCreateProgress {
  readonly importId: string;
  readonly status: 'running' | 'complete';
  readonly completed: number;
  readonly total: number;
}

export function ScheduleImportWorkspace() {
  const [management, setManagement] = useState<ScheduleManagementData | null>(
    null,
  );
  const [imports, setImports] = useState<ScheduleImportDetail[]>([]);
  const [selected, setSelected] = useState<ScheduleImportDetail | null>(null);
  const [staff, setStaff] = useState<StaffData[]>([]);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [showSpecialImport, setShowSpecialImport] = useState(false);
  const [configure, setConfigure] = useState<ScheduleVersionSummary | null>(
    null,
  );
  const [configureSpecial, setConfigureSpecial] =
    useState<SpecialScheduleSummary | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [activationPreview, setActivationPreview] =
    useState<ActivationPreview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [scheduleName, setScheduleName] = useState('Imported School Schedule');
  const [specialDate, setSpecialDate] = useState('');
  const [specialName, setSpecialName] = useState('');
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulkCreateProgress, setBulkCreateProgress] =
    useState<BulkCreateProgress | null>(null);

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
      setEffectiveFrom((value) => value || scheduleData.schoolDate);
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

  async function upload(event: React.FormEvent, kind: 'normal' | 'special') {
    event.preventDefault();
    if (!file) return setError('Choose an .xlsx workbook.');
    setBusy(true);
    setError(null);
    setBulkCreateProgress(null);
    try {
      const result = await uploadScheduleImport({
        file,
        kind,
        name: kind === 'normal' ? scheduleName : specialName,
        effectiveFrom: kind === 'normal' ? effectiveFrom : undefined,
        effectiveTo: kind === 'normal' ? effectiveTo : undefined,
        specialDate: kind === 'special' ? specialDate : undefined,
      });
      setSelected(result);
      setImports((values) => [
        result,
        ...values.filter((item) => item.id !== result.id),
      ]);
      setScheduleName(result.name);
      setSpecialName(result.name);
      setEffectiveFrom(result.effectiveFrom ?? '');
      setEffectiveTo(result.effectiveTo ?? '');
      setSpecialDate(result.specialDate ?? '');
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
    const selectedImport = selected;
    const missingMappings = [
      ...selectedImport.staffMappings
        .filter((item) => !item.targetId)
        .map((item) => ({ kind: 'staff' as const, ...item })),
      ...selectedImport.roomMappings
        .filter((item) => !item.targetId)
        .map((item) => ({ kind: 'room' as const, ...item })),
    ];
    const total = missingMappings.length;
    if (total === 0) return;

    let completed = 0;
    setBusy(true);
    setError(null);
    setBulkCreateProgress({
      importId: selectedImport.id,
      status: 'running',
      completed,
      total,
    });

    let result = selectedImport;
    try {
      for (const mapping of missingMappings) {
        result = await mapImportValue(selectedImport.id, {
          kind: mapping.kind,
          displayValue: mapping.displayValue,
          createNew: true,
        });
        completed += 1;
        replaceImport(result);
        setBulkCreateProgress({
          importId: selectedImport.id,
          status: 'running',
          completed,
          total,
        });
      }
    } catch (cause) {
      try {
        await refreshImportState(selectedImport.id);
      } catch {
        // Each successful mapping already replaced local state above.
      }
      setBulkCreateProgress(null);
      setError(
        `Creating records stopped after ${completed} of ${total}. ${message(cause)}`,
      );
      setBusy(false);
      return;
    }

    try {
      await refreshImportState(selectedImport.id, result);
    } catch (cause) {
      setError(
        `${total} record${total === 1 ? ' was' : 's were'} created, but refreshed Staff and Rooms could not be loaded. ${message(cause)}`,
      );
    }
    setBulkCreateProgress({
      importId: selectedImport.id,
      status: 'complete',
      completed,
      total,
    });
    setBusy(false);
  }

  async function refreshImportState(
    importId: string,
    fallback?: ScheduleImportDetail,
  ) {
    const [importValues, nextStaff, nextRooms] = await Promise.all([
      listScheduleImports(),
      listStaff(),
      listRooms(),
    ]);
    const refreshed =
      importValues.find((item) => item.id === importId) ?? fallback;
    setImports(importValues);
    if (refreshed) setSelected(refreshed);
    setStaff(nextStaff);
    setRooms(nextRooms);
  }

  function confirmCreateAllMissing() {
    if (!selected) return;
    const staffCount = selected.unmappedStaff;
    const roomCount = selected.unmappedRooms;
    const parts = [
      ...(staffCount
        ? [`${staffCount} Staff record${staffCount === 1 ? '' : 's'}`]
        : []),
      ...(roomCount
        ? [`${roomCount} Room record${roomCount === 1 ? '' : 's'}`]
        : []),
    ];
    setConfirmation({
      title:
        staffCount && roomCount
          ? 'Create missing Staff and Rooms?'
          : staffCount
            ? 'Create missing Staff?'
            : 'Create missing Rooms?',
      body: `This will create ${parts.join(' and ')}. These records remain even if the staged import is later deleted.`,
      confirmLabel: 'Create All Records',
      action: createAllMissing,
    });
  }

  async function saveStagedConfiguration() {
    if (!selected) return;
    await run(async () => {
      const result = await configureScheduleImport(
        selected.id,
        selected.kind === 'normal'
          ? {
              kind: 'normal',
              name: scheduleName,
              effectiveFrom,
              effectiveTo: effectiveTo || null,
            }
          : { kind: 'special', name: specialName, date: specialDate },
      );
      replaceImport(result);
    });
  }

  async function beginActivation() {
    if (!selected || selected.kind !== 'normal') return;
    await run(async () => {
      const configured = await configureScheduleImport(selected.id, {
        kind: 'normal',
        name: scheduleName,
        effectiveFrom,
        effectiveTo: effectiveTo || null,
      });
      replaceImport(configured);
      const preview = await previewScheduleActivation(selected.id);
      if (preview.action === 'close_predecessor') {
        setActivationPreview(preview);
      } else {
        await completeActivation(false);
      }
    });
  }

  async function beginSpecialActivation() {
    if (!selected || selected.kind !== 'special') return;
    try {
      const configured = await configureScheduleImport(selected.id, {
        kind: 'special',
        name: specialName,
        date: specialDate,
      });
      replaceImport(configured);
    } catch (cause) {
      setError(message(cause));
      return;
    }
    setConfirmation({
      title: 'Activate Special Schedule?',
      body: `${specialName} will be the schedule used for ${formatDate(specialDate)} only. Normal Schedule Versions will not apply on this date.`,
      confirmLabel: 'Activate Special Schedule',
      action: async () => {
        await run(async () => {
          await activateSpecialScheduleImport(selected.id);
          setSelected(null);
          setShowSpecialImport(false);
          await loadAll();
        });
      },
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

  function removeImport(item: ScheduleImportDetail) {
    setConfirmation({
      title: 'Delete staged import?',
      body: `${item.sourceFileName} and its staged entries and mappings will be deleted. Staff and Rooms already created from it will remain.`,
      confirmLabel: 'Delete Staged Import',
      action: async () =>
        run(async () => {
          await deleteScheduleImport(item.id);
          setImports((values) =>
            values.filter((value) => value.id !== item.id),
          );
          if (selected?.id === item.id) setSelected(null);
        }),
    });
  }

  function startOver(item: ScheduleImportDetail) {
    setConfirmation({
      title: 'Start over with a different workbook?',
      body: `The current staged import and its staged mappings and entries will be deleted. Staff and Rooms already created from it will remain.`,
      confirmLabel: 'Delete & Start Over',
      action: async () =>
        run(async () => {
          await deleteScheduleImport(item.id);
          setImports((values) =>
            values.filter((value) => value.id !== item.id),
          );
          setSelected(null);
          setTargets({});
          setScheduleName('Imported School Schedule');
          setEffectiveFrom(management?.schoolDate ?? '');
          setEffectiveTo('');
          setSpecialName('');
          setSpecialDate('');
          clearFile();
        }),
    });
  }

  function removeVersion(item: ScheduleVersionSummary) {
    setConfirmation({
      title: 'Delete Schedule Version?',
      body: `Permanently delete ${item.name}, its ${item.entryCount} Schedule Entries, and related import metadata? Staff and Rooms will not be deleted.`,
      confirmLabel: 'Delete Schedule Version',
      action: async () =>
        run(async () => setManagement(await deleteSchedule(item.id))),
    });
  }

  function archiveVersion(item: ScheduleVersionSummary) {
    setConfirmation({
      title: 'Archive Schedule Version?',
      body: `${item.name} is referenced by historical Sub Plans. It will stop participating in normal schedule resolution while pinned plans remain available.`,
      confirmLabel: 'Archive Schedule Version',
      action: async () =>
        run(async () => setManagement(await archiveSchedule(item.id))),
    });
  }

  function removeSpecial(item: SpecialScheduleSummary) {
    setConfirmation({
      title: 'Delete Special Schedule?',
      body: `Permanently delete ${item.name} and its ${item.entryCount} entries for ${formatDate(item.date)}? Staff and Rooms will not be deleted.`,
      confirmLabel: 'Delete Special Schedule',
      action: async () =>
        run(async () => setManagement(await deleteSpecialSchedule(item.id))),
    });
  }

  function archiveSpecial(item: SpecialScheduleSummary) {
    setConfirmation({
      title: 'Archive Special Schedule?',
      body: `${item.name} is referenced by historical Sub Plans. It will stop applying to new plans while pinned plans remain available.`,
      confirmLabel: 'Archive Special Schedule',
      action: async () =>
        run(async () => setManagement(await archiveSpecialSchedule(item.id))),
    });
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
    setBulkCreateProgress(null);
    try {
      await operation();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  const staged = imports.filter((item) => item.status !== 'activated');
  const selectedNormal =
    selected?.kind === 'normal' && selected.status !== 'activated'
      ? selected
      : null;
  const selectedSpecial =
    selected?.kind === 'special' && selected.status !== 'activated'
      ? selected
      : null;

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
      </header>

      {error && <ErrorBanner message={error} />}

      {showImport && (
        <section className="border-brand/30 overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="border-border flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-bold">Import Schedule</h2>
              <p className="text-muted-foreground text-xs">
                Receive → Parse → Stage → Validate → Map → Review → Activate
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close import workflow"
              disabled={busy}
              onClick={() => setShowImport(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          {selectedNormal ? (
            <StagedSourceSummary
              selected={selectedNormal}
              busy={busy}
              onStartOver={() => startOver(selectedNormal)}
            />
          ) : (
            <form
              onSubmit={(event) => void upload(event, 'normal')}
              className="grid grid-cols-[1fr_170px_170px_auto] items-end gap-3 p-5"
            >
              <WorkbookInput
                file={file}
                fileInput={fileInput}
                onFile={setFile}
                onClear={clearFile}
              />
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
          )}
          {selectedNormal && (
            <Configuration
              selected={selectedNormal}
              staff={staff}
              rooms={rooms}
              targets={targets}
              scheduleName={scheduleName}
              effectiveFrom={effectiveFrom}
              effectiveTo={effectiveTo}
              specialName={specialName}
              specialDate={specialDate}
              busy={busy}
              bulkCreateProgress={bulkCreateProgress}
              onName={setScheduleName}
              onEffectiveFrom={setEffectiveFrom}
              onEffectiveTo={setEffectiveTo}
              onSpecialName={setSpecialName}
              onSpecialDate={setSpecialDate}
              onTarget={(key, value) =>
                setTargets((current) => ({ ...current, [key]: value }))
              }
              onMap={map}
              onCreateAll={confirmCreateAllMissing}
              onSave={saveStagedConfiguration}
              onActivate={beginActivation}
            />
          )}
        </section>
      )}

      <section className="border-border overflow-hidden rounded-lg border bg-white">
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-bold">Normal Schedule Versions</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Status is derived for school date {management?.schoolDate ?? '…'}.
              Existing Sub Plans remain pinned when these ranges change.
            </p>
          </div>
          <Button
            disabled={busy}
            onClick={() => {
              setShowImport((value) => !value);
              setShowSpecialImport(false);
            }}
          >
            <Upload className="size-4" /> Import Schedule
          </Button>
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
                    Imported {formatDateTime(item.createdAt)} ·{' '}
                    {item.entryCount} blocks
                  </p>
                </div>
                <span>
                  {item.kind === 'special'
                    ? formatDate(item.specialDate ?? '')
                    : `${formatDate(item.effectiveFrom ?? '')} → ${
                        item.effectiveTo
                          ? formatDate(item.effectiveTo)
                          : 'Open-ended'
                      }`}
                </span>
                <div className="flex gap-2">
                  <Badge>
                    {item.kind === 'special' ? 'Special' : 'Normal'}
                  </Badge>
                  <Badge>{item.status}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {item.unmappedStaff + item.unmappedRooms} mappings
                  </span>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setBulkCreateProgress(null);
                      setSelected(item);
                      setScheduleName(item.name);
                      setSpecialName(item.name);
                      setEffectiveFrom(item.effectiveFrom ?? '');
                      setEffectiveTo(item.effectiveTo ?? '');
                      setSpecialDate(item.specialDate ?? '');
                      setShowImport(item.kind === 'normal');
                      setShowSpecialImport(item.kind === 'special');
                    }}
                  >
                    Resume Configuration
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busy}
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

      {showSpecialImport && (
        <section className="border-brand/30 overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="border-border flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-bold">Add Special Schedule</h2>
              <p className="text-muted-foreground text-xs">
                Receive → Parse → Stage → Validate → Map → Review → Activate
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close Special Schedule workflow"
              disabled={busy}
              onClick={() => setShowSpecialImport(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          {selectedSpecial ? (
            <StagedSourceSummary
              selected={selectedSpecial}
              busy={busy}
              onStartOver={() => startOver(selectedSpecial)}
            />
          ) : (
            <form
              onSubmit={(event) => void upload(event, 'special')}
              className="grid grid-cols-[1fr_200px_240px_auto] items-end gap-3 p-5"
            >
              <WorkbookInput
                file={file}
                fileInput={fileInput}
                onFile={setFile}
                onClear={clearFile}
              />
              <Labeled label="Date">
                <input
                  type="date"
                  value={specialDate}
                  onChange={(event) => setSpecialDate(event.target.value)}
                  className="field"
                  required
                />
              </Labeled>
              <Labeled label="Special Schedule Name">
                <input
                  value={specialName}
                  onChange={(event) => setSpecialName(event.target.value)}
                  className="field"
                  placeholder="Early Dismissal"
                  required
                />
              </Labeled>
              <Button type="submit" disabled={busy || !file}>
                Upload &amp; Validate
              </Button>
            </form>
          )}
          {selectedSpecial && (
            <Configuration
              selected={selectedSpecial}
              staff={staff}
              rooms={rooms}
              targets={targets}
              scheduleName={scheduleName}
              effectiveFrom={effectiveFrom}
              effectiveTo={effectiveTo}
              specialName={specialName}
              specialDate={specialDate}
              busy={busy}
              bulkCreateProgress={bulkCreateProgress}
              onName={setScheduleName}
              onEffectiveFrom={setEffectiveFrom}
              onEffectiveTo={setEffectiveTo}
              onSpecialName={setSpecialName}
              onSpecialDate={setSpecialDate}
              onTarget={(key, value) =>
                setTargets((current) => ({ ...current, [key]: value }))
              }
              onMap={map}
              onCreateAll={confirmCreateAllMissing}
              onSave={saveStagedConfiguration}
              onActivate={beginSpecialActivation}
            />
          )}
        </section>
      )}

      <section className="border-border overflow-hidden rounded-lg border bg-white">
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-bold">Special Schedules</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Each Special Schedule is the complete authoritative schedule for
              one date and is independent of normal schedule availability.
            </p>
          </div>
          <Button
            disabled={busy}
            onClick={() => {
              setShowSpecialImport((value) => !value);
              setShowImport(false);
            }}
          >
            <Plus className="size-4" /> Add Special Schedule
          </Button>
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
                <th className="px-3 py-2.5">Usage</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
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
                    {item.sourceFileName ?? '—'}
                  </td>
                  <td className="text-muted-foreground px-3 py-3 text-xs">
                    {item.entryCount} blocks · {item.planReferenceCount} pinned
                    Sub Plans
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setConfigureSpecial(item)}
                      >
                        <Settings2 className="size-3.5" /> Configure
                      </Button>
                      {item.status !== 'archived' &&
                        (item.canDelete ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeSpecial(item)}
                          >
                            <Trash2 className="size-3.5" /> Delete
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => archiveSpecial(item)}
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

      {configureSpecial && (
        <ConfigureSpecialDialog
          item={configureSpecial}
          busy={busy}
          onClose={() => setConfigureSpecial(null)}
          onSave={(input) =>
            void run(async () => {
              setManagement(
                await configureSpecialSchedule(configureSpecial.id, input),
              );
              setConfigureSpecial(null);
            })
          }
        />
      )}

      {confirmation && (
        <Modal title={confirmation.title} onClose={() => setConfirmation(null)}>
          <p className="text-sm leading-6">{confirmation.body}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmation(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                const action = confirmation.action;
                setConfirmation(null);
                void action();
              }}
            >
              {confirmation.confirmLabel}
            </Button>
          </div>
        </Modal>
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
                {item.entryCount} blocks · {item.planReferenceCount} pinned Sub
                Plans
              </p>
            </td>
            <td className="px-3 py-3">{formatDate(item.effectiveFrom)}</td>
            <td className="px-3 py-3">
              {item.effectiveTo ? formatDate(item.effectiveTo) : '—'}
            </td>
            <td className="px-3 py-3 capitalize">
              <Badge className={statusClass(item.status)}>{item.status}</Badge>
            </td>
            <td className="text-muted-foreground px-3 py-3">
              {item.sourceFileName ?? '—'}
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

function WorkbookInput({
  file,
  fileInput,
  onFile,
  onClear,
}: {
  readonly file: File | null;
  readonly fileInput: React.RefObject<HTMLInputElement | null>;
  readonly onFile: (file: File | null) => void;
  readonly onClear: () => void;
}) {
  return (
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
              onClear();
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
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        className="sr-only"
      />
    </label>
  );
}

function StagedSourceSummary({
  selected,
  busy,
  onStartOver,
}: {
  readonly selected: ScheduleImportDetail;
  readonly busy: boolean;
  readonly onStartOver: () => void;
}) {
  return (
    <div className="bg-muted/30 flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="border-brand/20 bg-brand-soft rounded-md border p-2">
          <FileSpreadsheet className="text-brand-dark size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-semibold">
            Workbook
          </p>
          <p className="truncate text-sm font-semibold">
            {selected.sourceFileName}
          </p>
          {selected.sheetName && (
            <p className="text-muted-foreground text-xs">
              Worksheet: {selected.sheetName}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-brand-dark flex items-center gap-1.5 text-sm font-semibold">
          <Check className="size-4" aria-hidden="true" /> Uploaded and staged
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={onStartOver}
        >
          Choose Different Workbook
        </Button>
      </div>
    </div>
  );
}

function BulkCreateStatus({
  progress,
}: {
  readonly progress: BulkCreateProgress;
}) {
  if (progress.status === 'complete') {
    return (
      <div
        className="text-brand-dark flex items-center gap-1.5 text-sm font-semibold"
        role="status"
        aria-live="polite"
      >
        <Check className="size-4" aria-hidden="true" />
        {progress.total} record{progress.total === 1 ? '' : 's'} created.
      </div>
    );
  }

  const progressText = `Creating records… ${progress.completed} of ${progress.total}`;
  return (
    <div aria-live="polite" aria-atomic="true">
      <div
        className="text-brand-dark flex items-center gap-1.5 text-sm font-semibold"
        role="progressbar"
        aria-label="Creating Staff and Room records"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.completed}
        aria-valuetext={progressText}
      >
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        {progressText}
      </div>
    </div>
  );
}

function Configuration({
  selected,
  staff,
  rooms,
  targets,
  scheduleName,
  effectiveFrom,
  effectiveTo,
  specialName,
  specialDate,
  busy,
  bulkCreateProgress,
  onName,
  onEffectiveFrom,
  onEffectiveTo,
  onSpecialName,
  onSpecialDate,
  onTarget,
  onMap,
  onCreateAll,
  onSave,
  onActivate,
}: {
  readonly selected: ScheduleImportDetail;
  readonly staff: readonly StaffData[];
  readonly rooms: readonly RoomData[];
  readonly targets: Readonly<Record<string, string>>;
  readonly scheduleName: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string;
  readonly specialName: string;
  readonly specialDate: string;
  readonly busy: boolean;
  readonly bulkCreateProgress: BulkCreateProgress | null;
  readonly onName: (value: string) => void;
  readonly onEffectiveFrom: (value: string) => void;
  readonly onEffectiveTo: (value: string) => void;
  readonly onSpecialName: (value: string) => void;
  readonly onSpecialDate: (value: string) => void;
  readonly onTarget: (key: string, value: string) => void;
  readonly onMap: (
    kind: 'staff' | 'room',
    displayValue: string,
    createNew: boolean,
  ) => Promise<void>;
  readonly onCreateAll: () => void;
  readonly onSave: () => Promise<void>;
  readonly onActivate: () => Promise<void>;
}) {
  const missing = selected.unmappedStaff + selected.unmappedRooms;
  const selectedBulkProgress =
    bulkCreateProgress?.importId === selected.id ? bulkCreateProgress : null;
  return (
    <div
      className="border-border border-t"
      aria-busy={selectedBulkProgress?.status === 'running'}
    >
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-bold">
              {selected.kind === 'normal'
                ? 'Schedule Configuration'
                : 'Special Schedule Configuration'}
            </h2>
            <Badge>{selected.status}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {selected.entryCount} staged blocks
            {selected.aBDetected ? ' · A/B schedule detected' : ''}
          </p>
        </div>
        <div className="flex min-h-8 items-center justify-end">
          {selectedBulkProgress ? (
            <BulkCreateStatus progress={selectedBulkProgress} />
          ) : (
            missing > 0 && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={onCreateAll}
              >
                Create All Missing
              </Button>
            )
          )}
        </div>
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
        {selected.kind === 'normal' ? (
          <div className="grid flex-1 grid-cols-[1fr_170px_170px] gap-3">
            <Labeled label="Schedule Version name">
              <input
                value={scheduleName}
                onChange={(event) => onName(event.target.value)}
                className="field"
                disabled={busy}
                required
              />
            </Labeled>
            <Labeled label="Effective From">
              <input
                type="date"
                value={effectiveFrom}
                onChange={(event) => onEffectiveFrom(event.target.value)}
                className="field"
                disabled={busy}
                required
              />
            </Labeled>
            <Labeled label="Effective To (optional)">
              <input
                type="date"
                min={effectiveFrom}
                value={effectiveTo}
                onChange={(event) => onEffectiveTo(event.target.value)}
                className="field"
                disabled={busy}
              />
            </Labeled>
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-[1fr_190px] gap-3">
            <Labeled label="Special Schedule Name">
              <input
                value={specialName}
                onChange={(event) => onSpecialName(event.target.value)}
                className="field"
                disabled={busy}
                required
              />
            </Labeled>
            <Labeled label="Date">
              <input
                type="date"
                value={specialDate}
                onChange={(event) => onSpecialDate(event.target.value)}
                className="field"
                disabled={busy}
                required
              />
            </Labeled>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void onSave()}
          >
            Save Configuration
          </Button>
          <Button
            disabled={busy || selected.blockingErrors > 0 || missing > 0}
            onClick={() => void onActivate()}
          >
            <Check className="size-4" />{' '}
            {selected.kind === 'normal'
              ? 'Activate Schedule Version'
              : 'Activate Special Schedule'}
          </Button>
        </div>
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

function ConfigureSpecialDialog({
  item,
  busy,
  onClose,
  onSave,
}: {
  readonly item: SpecialScheduleSummary;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSave: (input: { name: string; date: string }) => void;
}) {
  const [name, setName] = useState(item.name);
  const [date, setDate] = useState(item.date);
  return (
    <Modal title="Configure Special Schedule" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ name, date });
        }}
        className="space-y-4"
      >
        <p className="text-muted-foreground text-sm">
          {item.planReferenceCount > 0
            ? 'This Special Schedule is pinned by a Sub Plan. Its date is immutable, but its name may be corrected.'
            : 'An unused Special Schedule may be renamed or moved to an unconfigured date.'}
        </p>
        <Labeled label="Special Schedule Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="field"
            required
          />
        </Labeled>
        <Labeled label="Date">
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="field"
            disabled={item.planReferenceCount > 0}
            required
          />
        </Labeled>
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
        disabled={busy}
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
