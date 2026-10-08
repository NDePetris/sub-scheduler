import { Split, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { defaultSplitBoundary } from '@/domain/planning';
import {
  assignmentNote,
  assignmentResolutionLabel,
  formatRoomLabel,
} from '@/features/sub-plan/sub-plan-presentation';
import {
  ApiError,
  getCandidates,
  listRooms,
  resolveAssignment,
  type AssignmentResolutionInput,
  type CandidatePreview,
  type PlanAssignment,
  type PlanDetail,
  type RoomData,
  type StaffData,
} from '@/lib/api';
import { cn } from '@/lib/cn';
import { CandidateLedger } from './candidate-ledger';

export function ResolveSubNeedDrawer({
  assignment: initialAssignment,
  detail,
  staff,
  onClose,
  onChange,
}: {
  readonly assignment: PlanAssignment;
  readonly detail: PlanDetail;
  readonly staff: readonly StaffData[];
  readonly onClose: () => void;
  readonly onChange: (detail: PlanDetail) => void;
}) {
  const [activeAssignmentId, setActiveAssignmentId] = useState(
    () =>
      initialAssignment.sharedDutyStaffing?.positions.find(
        (position) =>
          position.absent &&
          position.assignmentId &&
          !position.hasExplicitResolution,
      )?.assignmentId ?? initialAssignment.id,
  );
  const assignment =
    detail.assignments.find((item) => item.id === activeAssignmentId) ??
    initialAssignment;
  const [candidates, setCandidates] = useState<CandidatePreview[]>([]);
  const [candidateAssignmentId, setCandidateAssignmentId] = useState('');
  const [candidateRetry, setCandidateRetry] = useState(0);
  const candidateRequestKey = `${assignment.id}:${detail.plan.structuredRevision}:${candidateRetry}`;
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingCandidateId, setConfirmingCandidateId] = useState<
    string | null
  >(null);
  const [otherStaffSearch, setOtherStaffSearch] = useState('');
  const [splitOpen, setSplitOpen] = useState(false);
  const [showOtherStaff, setShowOtherStaff] = useState(false);
  const readOnly = detail.plan.status === 'finalized';
  const [alternateEditor, setAlternateEditor] = useState<
    'combine' | 'redistribute' | null
  >(null);
  const [combineEntryId, setCombineEntryId] = useState('');
  const [redistributionStaffIds, setRedistributionStaffIds] = useState<
    string[]
  >(() => redistributionIds(assignment.resolutionDetails));
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomId, setRoomId] = useState(
    assignment.roomId === assignment.scheduledRoomId
      ? ''
      : (assignment.roomId ?? ''),
  );
  const [note, setNote] = useState(
    assignmentNote(assignment.resolutionDetails) ?? '',
  );
  const [pendingOverride, setPendingOverride] =
    useState<AssignmentResolutionInput | null>(null);
  const [confirmLeaveUncovered, setConfirmLeaveUncovered] = useState(false);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void getCandidates(assignment.id, { signal: controller.signal })
      .then((values) => {
        if (controller.signal.aborted) return;
        setCandidates(values);
        setCandidateAssignmentId(candidateRequestKey);
        setCandidateError(null);
      })
      .catch((cause: unknown) => {
        if (
          !controller.signal.aborted &&
          !(cause instanceof DOMException && cause.name === 'AbortError')
        ) {
          setCandidateError(errorMessage(cause));
          setCandidateAssignmentId(candidateRequestKey);
        }
      });
    return () => controller.abort();
  }, [assignment.id, candidateRequestKey]);

  useEffect(() => {
    const controller = new AbortController();
    void listRooms(controller.signal)
      .then(setRooms)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError'))
          setActionError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setRoomsLoading(false);
      });
    return () => controller.abort();
  }, []);

  const recommended = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          candidate.availability !== 'manual' &&
          candidate.conflicts.length === 0,
      ),
    [candidates],
  );
  const otherStaff = useMemo(() => {
    const query = otherStaffSearch.trim().toLocaleLowerCase('en-US');
    return candidates.filter((candidate) => {
      if (
        candidate.availability !== 'manual' &&
        candidate.conflicts.length === 0
      )
        return false;
      return (
        !query ||
        `${candidate.displayName} ${candidate.availabilitySource} ${candidate.conflicts.join(' ')}`
          .toLocaleLowerCase('en-US')
          .includes(query)
      );
    });
  }, [candidates, otherStaffSearch]);
  const otherStaffCount = candidates.length - recommended.length;
  const candidatesLoading = candidateAssignmentId !== candidateRequestKey;

  const concurrentCombineEntries = useMemo(() => {
    const activeStaffIds = new Set(staff.map((person) => person.id));
    return detail.schedule.filter(
      (entry) =>
        activeStaffIds.has(entry.staffId) &&
        entry.staffId !== assignment.absentStaff.id &&
        (entry.dayType === 'ALL' || entry.dayType === detail.plan.dayType) &&
        entry.activityType === 'instruction' &&
        entry.startTime < assignment.endTime &&
        assignment.startTime < entry.endTime,
    );
  }, [assignment, detail, staff]);

  function selectAssignment(
    assignmentId: string,
    sourceDetail: PlanDetail = detail,
  ) {
    const next = sourceDetail.assignments.find(
      (item) => item.id === assignmentId,
    );
    if (!next) return;
    setRoomId(next.roomId === next.scheduledRoomId ? '' : (next.roomId ?? ''));
    setNote(assignmentNote(next.resolutionDetails) ?? '');
    setConfirmingCandidateId(null);
    setPendingOverride(null);
    setActionError(null);
    setAlternateEditor(null);
    setConfirmLeaveUncovered(false);
    setRedistributionStaffIds(redistributionIds(next.resolutionDetails));
    setActiveAssignmentId(assignmentId);
  }

  async function act(
    input: AssignmentResolutionInput,
    targetAssignmentId = assignment.id,
  ) {
    if (readOnly || busy) return;
    setBusy(true);
    setActionError(null);
    setPendingOverride(null);
    try {
      const nextDetail = await resolveAssignment(targetAssignmentId, input);
      onChange(nextDetail);
      if (input.action !== 'clear_resolution') {
        const updated = nextDetail.assignments.find(
          (item) => item.id === targetAssignmentId,
        );
        const nextVacancy = updated?.sharedDutyStaffing?.positions.find(
          (position) =>
            position.absent &&
            position.assignmentId &&
            !position.hasExplicitResolution,
        );
        if (nextVacancy?.assignmentId)
          selectAssignment(nextVacancy.assignmentId, nextDetail);
      }
    } catch (cause) {
      setActionError(errorMessage(cause));
      if (
        cause instanceof ApiError &&
        cause.code === 'override_acknowledgement_required' &&
        (input.action === 'combine_class' || input.action === 'redistribute')
      ) {
        setPendingOverride({ ...input, overrideAcknowledged: true });
      }
    } finally {
      setBusy(false);
    }
  }

  function openAlternateEditor(value: 'combine' | 'redistribute') {
    setSplitOpen(false);
    setConfirmLeaveUncovered(false);
    setAlternateEditor(value);
    setPendingOverride(null);
    setActionError(null);
    if (value === 'combine') {
      const existingId = combineEntryIdFrom(assignment.resolutionDetails);
      const firstId = existingId || concurrentCombineEntries[0]?.id || '';
      setCombineEntryId(firstId);
      const target = concurrentCombineEntries.find(
        (entry) => entry.id === firstId,
      );
      if (assignment.roomId === assignment.scheduledRoomId && target?.roomId)
        setRoomId(target.roomId);
    }
  }

  function closeDrawer() {
    if (busy) return;
    if (
      splitOpen &&
      !window.confirm('Discard the unsaved split draft and close?')
    )
      return;
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black/20"
      role="presentation"
      onMouseDown={closeDrawer}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="resolve-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="border-border absolute inset-y-0 right-0 flex w-[min(100vw,calc(520px+15.625vw))] max-w-[800px] flex-col overflow-hidden border-l bg-white shadow-xl"
      >
        <div className="border-border sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <div>
            <h2 id="resolve-title" className="font-bold">
              Resolve Sub Need
            </h2>
            <p className="text-muted-foreground text-xs">
              {detail.plan.date} · {detail.plan.dayType} Day
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={closeDrawer}
            disabled={busy}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div
          className="border-border bg-muted/40 shrink-0 border-b px-5 py-3"
          data-need-context
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-bold">{assignment.absentStaff.displayName}</p>
            <p className="text-sm tabular-nums">
              {assignment.startTime}–{assignment.endTime} ·{' '}
              {formatRoomLabel(assignment.room) ?? 'No room'}
            </p>
          </div>
          <p className="mt-1 text-sm wrap-anywhere">
            {assignment.description}{' '}
            <span className="text-muted-foreground">
              · {assignment.responsibilityType.replace('_', ' ')}
            </span>
          </p>
          {assignment.defaultAction && (
            <div className="mt-2 text-xs" role="status">
              <span className="font-semibold">Default Sub Plan: </span>
              {assignment.defaultAction.staffName ??
                assignment.defaultAction.actionType.replaceAll('_', ' ')}
              {assignment.conflictExplanation && (
                <span className="text-danger-dark mt-1 block">
                  Default unavailable: {assignment.conflictExplanation}
                </span>
              )}
            </div>
          )}
          {readOnly && (
            <p className="mt-2 text-sm font-semibold" role="status">
              Finalized · Read only. Reopen the Sub Plan to edit Assignments.
            </p>
          )}
        </div>
        {!readOnly && !splitOpen && (
          <div
            className="border-border flex shrink-0 gap-2 border-b px-5 py-2"
            aria-label="Candidate source"
          >
            <Button
              size="sm"
              variant={
                !showOtherStaff && !splitOpen && !alternateEditor
                  ? 'primary'
                  : 'secondary'
              }
              disabled={busy}
              aria-pressed={!showOtherStaff && !splitOpen && !alternateEditor}
              onClick={() => {
                setShowOtherStaff(false);
                setSplitOpen(false);
                setAlternateEditor(null);
                setConfirmLeaveUncovered(false);
              }}
            >
              Recommended ({recommended.length})
            </Button>
            <Button
              size="sm"
              variant={
                showOtherStaff && !splitOpen && !alternateEditor
                  ? 'primary'
                  : 'secondary'
              }
              disabled={busy}
              aria-pressed={showOtherStaff && !splitOpen && !alternateEditor}
              onClick={() => {
                setShowOtherStaff(true);
                setSplitOpen(false);
                setAlternateEditor(null);
                setConfirmLeaveUncovered(false);
              }}
            >
              Other Staff ({otherStaffCount})
            </Button>
          </div>
        )}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5"
          data-decision-body
        >
          <fieldset disabled={readOnly || busy} className="min-w-0 space-y-5">
            {actionError && <ErrorBanner message={actionError} />}
            {pendingOverride && (
              <div className="border-danger/30 bg-danger-soft rounded-md border p-3">
                <p className="text-danger-dark text-sm font-bold">
                  This choice has an operational conflict.
                </p>
                <p className="mt-1 text-xs">
                  Review the warning above, then explicitly acknowledge it to
                  save this resolution.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPendingOverride(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void act(pendingOverride)}
                  >
                    Assign Anyway
                  </Button>
                </div>
              </div>
            )}

            {!splitOpen &&
              !alternateEditor &&
              (assignment.sharedDutyStaffing ? (
                <SharedDutyStaffing
                  staffing={assignment.sharedDutyStaffing}
                  activeAssignmentId={assignment.id}
                  busy={busy || readOnly}
                  onSelect={selectAssignment}
                  onClear={(assignmentId) =>
                    void act({ action: 'clear_resolution' }, assignmentId)
                  }
                />
              ) : assignment.status !== 'unresolved' ? (
                <div className="space-y-2">
                  <CurrentChoice assignment={assignment} />
                  {hasPrimaryResolution(assignment) && (
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy || readOnly}
                        onClick={() => void act({ action: 'clear_resolution' })}
                      >
                        Clear Resolution
                      </Button>
                    </div>
                  )}
                </div>
              ) : null)}

            {!readOnly &&
              !splitOpen &&
              !alternateEditor &&
              !confirmLeaveUncovered && (
                <section aria-labelledby="assign-a-sub-title">
                  <h3 id="assign-a-sub-title" className="font-bold">
                    {showOtherStaff ? 'Other Staff' : 'Assign a Sub'}
                  </h3>
                  <p className="text-muted-foreground mt-1 mb-3 text-xs">
                    Default → School Sub → PLAN / Admin / Available → Manual.
                    Recent Plan Periods Lost orders comparable candidates.
                  </p>
                  {showOtherStaff && (
                    <label className="mb-3 block text-xs font-semibold">
                      Search Other Staff
                      <input
                        className="field mt-1"
                        value={otherStaffSearch}
                        onChange={(event) =>
                          setOtherStaffSearch(event.target.value)
                        }
                        placeholder="Name, availability, or conflict"
                      />
                    </label>
                  )}
                  {candidatesLoading ? (
                    <CandidateSkeleton />
                  ) : candidateError ? (
                    <div className="space-y-2">
                      <ErrorBanner message={candidateError} />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setCandidateAssignmentId('');
                          setCandidateRetry((value) => value + 1);
                        }}
                      >
                        Retry candidates
                      </Button>
                    </div>
                  ) : (
                    <CandidateLedger
                      candidates={showOtherStaff ? otherStaff : recommended}
                      busy={busy}
                      confirmingId={confirmingCandidateId}
                      onSelect={(candidate) =>
                        candidate.conflicts.length
                          ? setConfirmingCandidateId(candidate.id)
                          : void act({
                              action: 'assign',
                              staffId: candidate.id,
                              assignAnyway: false,
                            })
                      }
                      onCancel={() => setConfirmingCandidateId(null)}
                      onConfirm={(candidate) => {
                        setConfirmingCandidateId(null);
                        void act({
                          action: 'assign',
                          staffId: candidate.id,
                          assignAnyway: true,
                        });
                      }}
                    />
                  )}
                </section>
              )}

            {!readOnly && (
              <section>
                {alternateEditor && (
                  <div className="border-border mt-3 space-y-3 rounded-md border bg-white p-3">
                    {alternateEditor === 'combine' ? (
                      <Labeled label="Combine with">
                        {concurrentCombineEntries.length > 0 ? (
                          <select
                            value={combineEntryId}
                            onChange={(event) => {
                              const entryId = event.target.value;
                              setCombineEntryId(entryId);
                              const target = concurrentCombineEntries.find(
                                (entry) => entry.id === entryId,
                              );
                              if (
                                assignment.roomId ===
                                  assignment.scheduledRoomId &&
                                target?.roomId
                              )
                                setRoomId(target.roomId);
                            }}
                            className="field"
                          >
                            {concurrentCombineEntries.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.staffName} — {entry.description} ·{' '}
                                {entry.startTime}–{entry.endTime}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="border-border text-muted-foreground block rounded-md border border-dashed p-3 text-sm font-normal">
                            No concurrent instructional classes are available
                            for this Assignment.
                          </span>
                        )}
                      </Labeled>
                    ) : (
                      <fieldset>
                        <legend className="text-muted-foreground text-xs font-semibold">
                          Redistribute to
                        </legend>
                        <div className="border-border mt-1 max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                          {staff
                            .filter(
                              (person) =>
                                person.id !== assignment.absentStaff.id,
                            )
                            .map((person) => (
                              <label
                                key={person.id}
                                className="flex items-center gap-2 rounded px-1 py-1 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={redistributionStaffIds.includes(
                                    person.id,
                                  )}
                                  onChange={(event) =>
                                    setRedistributionStaffIds((current) =>
                                      event.target.checked
                                        ? [...current, person.id]
                                        : current.filter(
                                            (id) => id !== person.id,
                                          ),
                                    )
                                  }
                                />
                                {person.displayName}
                              </label>
                            ))}
                        </div>
                        <p className="text-muted-foreground mt-1 text-xs">
                          Choose at least two recipients. Equal split is used by
                          default; no student data is recorded.
                        </p>
                      </fieldset>
                    )}

                    <AssignmentDetailsFields
                      assignment={assignment}
                      rooms={rooms}
                      roomsLoading={roomsLoading}
                      roomId={roomId}
                      note={note}
                      onRoomChange={setRoomId}
                      onNoteChange={setNote}
                    />

                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setAlternateEditor(null);
                          setPendingOverride(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={
                          busy ||
                          (alternateEditor === 'combine'
                            ? !combineEntryId
                            : redistributionStaffIds.length < 2)
                        }
                        onClick={() =>
                          void act(
                            alternateEditor === 'combine'
                              ? {
                                  action: 'combine_class',
                                  receivingScheduleEntryId: combineEntryId,
                                  roomId: roomId || null,
                                  note: note.trim() || null,
                                  overrideAcknowledged: false,
                                }
                              : {
                                  action: 'redistribute',
                                  receivingStaffIds: redistributionStaffIds,
                                  roomId: roomId || null,
                                  note: note.trim() || null,
                                  overrideAcknowledged: false,
                                },
                          )
                        }
                      >
                        {alternateEditor === 'combine'
                          ? 'Save Combined Class'
                          : 'Save Redistribution'}
                      </Button>
                    </div>
                  </div>
                )}
                {confirmLeaveUncovered && (
                  <div
                    className="border-danger/30 bg-danger-soft mt-3 rounded-md border p-3"
                    role="alertdialog"
                    aria-labelledby="leave-uncovered-title"
                  >
                    <p
                      id="leave-uncovered-title"
                      className="text-danger-dark text-sm font-bold"
                    >
                      Mark instructional coverage Intentionally Uncovered?
                    </p>
                    <p className="mt-1 text-xs">
                      This Assignment is instructional. Confirming will record
                      the administrator override as Intentionally Uncovered.
                    </p>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setConfirmLeaveUncovered(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setConfirmLeaveUncovered(false);
                          void act({
                            action: 'leave_uncovered',
                            acknowledged: true,
                          });
                        }}
                      >
                        Mark Intentionally Uncovered Anyway
                      </Button>
                    </div>
                  </div>
                )}
                {splitOpen && (
                  <SplitAssignmentEditor
                    key={assignment.id}
                    assignment={assignment}
                    staff={staff}
                    snapMinutes={detail.settings.splitSnapMinutes}
                    onBusyChange={setBusy}
                    onCancel={() => setSplitOpen(false)}
                    onChange={(nextDetail) => {
                      setSplitOpen(false);
                      onChange(nextDetail);
                    }}
                  />
                )}
              </section>
            )}

            {!readOnly && !alternateEditor && !splitOpen && (
              <section className="border-border space-y-3 rounded-lg border p-4">
                <div>
                  <h3 className="text-sm font-bold">Details</h3>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Room and Note supplement the primary resolution. They do not
                    resolve an Unresolved Assignment by themselves.
                  </p>
                </div>
                <AssignmentDetailsFields
                  assignment={assignment}
                  rooms={rooms}
                  roomsLoading={roomsLoading}
                  roomId={roomId}
                  note={note}
                  onRoomChange={setRoomId}
                  onNoteChange={setNote}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={busy || roomsLoading}
                    onClick={() =>
                      void act({
                        action: 'update_details',
                        roomId: roomId || null,
                        note: note.trim() || null,
                      })
                    }
                  >
                    Save Details
                  </Button>
                </div>
              </section>
            )}
          </fieldset>
        </div>
        {!readOnly && !splitOpen && (
          <footer
            className="border-border shrink-0 border-t bg-white px-5 py-3"
            aria-label="Alternate resolutions"
          >
            <fieldset disabled={busy}>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSplitOpen(true);
                    setAlternateEditor(null);
                    setConfirmLeaveUncovered(false);
                  }}
                >
                  <Split className="size-3.5" /> Split Assignment
                </Button>
                {assignment.responsibilityType === 'instruction' && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openAlternateEditor('redistribute')}
                    >
                      Redistribute Class
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openAlternateEditor('combine')}
                    >
                      Combine Class
                    </Button>
                  </>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSplitOpen(false);
                    setAlternateEditor(null);
                    const needsAck =
                      assignment.responsibilityType === 'instruction';
                    if (needsAck) {
                      setConfirmLeaveUncovered(true);
                    } else {
                      void act({
                        action: 'leave_uncovered',
                        acknowledged: false,
                      });
                    }
                  }}
                >
                  Mark Intentionally Uncovered
                </Button>
              </div>
            </fieldset>
          </footer>
        )}
      </aside>
    </div>
  );
}

interface SplitDraftSegment {
  readonly key: string;
  readonly staffId: string;
  readonly endTime: string;
}

interface SplitConflictGroup {
  readonly segmentNumber: number;
  readonly staffName: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly conflicts: readonly string[];
}

function SplitAssignmentEditor({
  assignment,
  staff,
  onBusyChange,
  snapMinutes,
  onCancel,
  onChange,
}: {
  readonly assignment: PlanAssignment;
  readonly staff: readonly StaffData[];
  readonly onBusyChange: (busy: boolean) => void;
  readonly snapMinutes: number;
  readonly onCancel: () => void;
  readonly onChange: (detail: PlanDetail) => void;
}) {
  const [drafts, setDrafts] = useState<SplitDraftSegment[]>(() =>
    initialSplitDraft(assignment, snapMinutes),
  );
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [candidateRetry, setCandidateRetry] = useState(0);
  const [candidateErrors, setCandidateErrors] = useState<
    Record<string, string>
  >({});
  const [candidateMap, setCandidateMap] = useState<
    Record<string, readonly CandidatePreview[]>
  >({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingOverride, setPendingOverride] = useState<{
    readonly segments: readonly {
      readonly staffId: string;
      readonly startTime: string;
      readonly endTime: string;
    }[];
    readonly groups: readonly SplitConflictGroup[];
    readonly serverMessage: string;
  } | null>(null);

  const intervals = useMemo(
    () =>
      drafts.map((draft, index) => ({
        key: draft.key,
        staffId: draft.staffId,
        startTime:
          index === 0 ? assignment.startTime : drafts[index - 1]!.endTime,
        endTime: draft.endTime,
      })),
    [assignment.startTime, drafts],
  );
  const structurallyValid =
    intervals.length >= 2 &&
    intervals.every(
      (segment) =>
        segment.staffId &&
        segment.startTime < segment.endTime &&
        segment.startTime >= assignment.startTime &&
        segment.endTime <= assignment.endTime,
    ) &&
    intervals.at(-1)?.endTime === assignment.endTime;
  const canAddSegment = intervals.some(
    (segment) => minutes(segment.endTime) - minutes(segment.startTime) >= 2,
  );

  // Only interval changes invalidate previews; staff selections retain their draft evidence.
  const intervalSignature = JSON.stringify(
    intervals.map(({ key, startTime, endTime }) => ({
      key,
      startTime,
      endTime,
    })),
  );
  useEffect(() => {
    const controller = new AbortController();
    const requested = JSON.parse(intervalSignature) as {
      key: string;
      startTime: string;
      endTime: string;
    }[];
    const timeout = window.setTimeout(() => {
      for (const segment of requested) {
        if (!segment.startTime || segment.startTime >= segment.endTime)
          continue;
        const key = `${segment.key}:${segment.startTime}:${segment.endTime}`;
        void getCandidates(assignment.id, {
          ...segment,
          signal: controller.signal,
        })
          .then((values) => {
            if (!controller.signal.aborted) {
              setCandidateMap((current) => ({ ...current, [key]: values }));
              setCandidateErrors((current) => ({ ...current, [key]: '' }));
            }
          })
          .catch((cause: unknown) => {
            if (!controller.signal.aborted)
              setCandidateErrors((current) => ({
                ...current,
                [key]: errorMessage(cause),
              }));
          });
      }
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [assignment.id, intervalSignature, candidateRetry]);
  const active =
    intervals.find((segment) => segment.key === activeKey) ?? intervals[0]!;
  function candidatesFor(segment: typeof active) {
    return candidateMap[
      `${segment.key}:${segment.startTime}:${segment.endTime}`
    ];
  }
  function errorFor(segment: typeof active) {
    return candidateErrors[
      `${segment.key}:${segment.startTime}:${segment.endTime}`
    ];
  }

  function updateDrafts(
    update: (current: readonly SplitDraftSegment[]) => SplitDraftSegment[],
  ) {
    setDrafts(update);
    setPendingOverride(null);
    setSaveError(null);
  }

  function addSegment() {
    let targetIndex = -1;
    let targetDuration = -1;
    intervals.forEach((segment, index) => {
      const duration = minutes(segment.endTime) - minutes(segment.startTime);
      if (duration >= 2 && duration > targetDuration) {
        targetIndex = index;
        targetDuration = duration;
      }
    });
    if (targetIndex < 0) return;
    const target = intervals[targetIndex]!;
    const boundary = splitBoundary(
      target.startTime,
      target.endTime,
      snapMinutes,
    );
    updateDrafts((current) => {
      const next = [...current];
      const existing = next[targetIndex]!;
      next[targetIndex] = { ...existing, endTime: boundary };
      next.splice(targetIndex + 1, 0, {
        key: newSplitKey(),
        staffId: '',
        endTime: existing.endTime,
      });
      return next;
    });
  }

  function removeSegment(index: number) {
    if (drafts.length <= 2) return;
    updateDrafts((current) => {
      const next = [...current];
      const removed = next[index]!;
      if (index > 0) {
        next[index - 1] = { ...next[index - 1]!, endTime: removed.endTime };
      }
      next.splice(index, 1);
      return next;
    });
  }

  function proposedSegments() {
    return intervals.map((segment) => ({
      staffId: segment.staffId,
      startTime: segment.startTime,
      endTime: segment.endTime,
    }));
  }

  function conflictGroups(): SplitConflictGroup[] {
    return intervals.flatMap((segment, index) => {
      const selected = candidatesFor(segment)?.find(
        (candidate) => candidate.id === segment.staffId,
      );
      return selected && selected.conflicts.length > 0
        ? [
            {
              segmentNumber: index + 1,
              staffName: selected.displayName,
              startTime: segment.startTime,
              endTime: segment.endTime,
              conflicts: selected.conflicts,
            },
          ]
        : [];
    });
  }

  async function saveSplit(
    segments: readonly {
      readonly staffId: string;
      readonly startTime: string;
      readonly endTime: string;
    }[],
    assignAnyway: boolean,
  ) {
    if (saving) return;
    onBusyChange(true);
    setSaving(true);
    setSaveError(null);
    try {
      const detail = await resolveAssignment(assignment.id, {
        action: 'split',
        segments,
        assignAnyway,
      });
      setPendingOverride(null);
      onChange(detail);
    } catch (cause) {
      if (
        !assignAnyway &&
        cause instanceof ApiError &&
        cause.code === 'override_acknowledgement_required'
      ) {
        setPendingOverride({
          segments,
          groups: conflictGroups(),
          serverMessage: cause.message,
        });
      } else {
        setSaveError(errorMessage(cause));
      }
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  }

  return (
    <div className="border-border mt-3 space-y-3 rounded-md border bg-white p-3">
      <div>
        <h4 className="text-sm font-bold">Split Coverage</h4>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Internal boundaries use the {snapMinutes}-minute editing convention.
          Adjacent segments move together, while the Assignment start and end
          remain fixed.
        </p>
      </div>

      {saveError && <ErrorBanner message={saveError} />}

      <fieldset disabled={saving} className="min-w-0 space-y-3">
        <ol
          className="divide-border divide-y rounded-md border"
          aria-label="Split segment summary"
        >
          {intervals.map((segment, index) => {
            const selected = candidatesFor(segment)?.find(
              (candidate) => candidate.id === segment.staffId,
            );
            const invalid =
              !segment.startTime ||
              segment.startTime >= segment.endTime ||
              segment.endTime > assignment.endTime ||
              segment.startTime < assignment.startTime;
            const state = invalid
              ? 'Invalid boundary'
              : !segment.staffId
                ? 'Incomplete'
                : errorFor(segment)
                  ? 'Availability unavailable'
                  : !candidatesFor(segment)
                    ? 'Checking availability'
                    : !selected
                      ? 'No longer eligible'
                      : selected.conflicts.length
                        ? 'Conflict'
                        : selected.warnings.length ||
                            (selected.projectedBurden !== null &&
                              selected.projectedBurden >= selected.threshold)
                          ? 'Warning'
                          : 'Complete';
            return (
              <li
                key={segment.key}
                className="flex flex-wrap items-center gap-3 p-2"
              >
                <button
                  type="button"
                  aria-pressed={active.key === segment.key}
                  aria-controls="active-split-interval"
                  onClick={() => setActiveKey(segment.key)}
                  className={cn(
                    'focus-visible:outline-brand-dark min-w-0 flex-1 rounded p-2 text-left focus-visible:outline-2',
                    active.key === segment.key && 'bg-brand-soft',
                  )}
                >
                  <span className="block text-sm font-semibold">
                    Segment {index + 1} · {segment.startTime}–{segment.endTime}
                  </span>
                  <span className="block text-xs wrap-anywhere">
                    {selected?.displayName ??
                      staff.find((person) => person.id === segment.staffId)
                        ?.displayName ??
                      'Choose staff'}{' '}
                    ·{' '}
                    <span
                      aria-live="polite"
                      className={
                        state === 'Complete'
                          ? 'text-brand-dark'
                          : 'text-danger-dark'
                      }
                    >
                      {state}
                    </span>
                  </span>
                </button>
                {index < intervals.length - 1 && (
                  <Labeled label={`Segment ${index + 1} ends at`}>
                    <input
                      type="time"
                      step={snapMinutes * 60}
                      min={segment.startTime}
                      max={intervals[index + 1]!.endTime}
                      value={segment.endTime}
                      aria-invalid={invalid}
                      onChange={(event) => {
                        const endTime = event.target.value;
                        updateDrafts((current) =>
                          current.map((draft) =>
                            draft.key === segment.key
                              ? { ...draft, endTime }
                              : draft,
                          ),
                        );
                      }}
                      className="field"
                    />
                  </Labeled>
                )}
                {drafts.length > 2 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove segment ${index + 1}`}
                    onClick={() => removeSegment(index)}
                  >
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
        <section id="active-split-interval" aria-label="Active split interval">
          <h5 className="text-sm font-bold" aria-live="polite">
            Select staff · {active.startTime}–{active.endTime}
          </h5>
          <SegmentCandidatePicker
            key={active.key}
            candidates={candidatesFor(active)}
            error={errorFor(active)}
            onRetry={() => setCandidateRetry((value) => value + 1)}
            staffId={active.staffId}
            onStaffChange={(staffId) =>
              updateDrafts((current) =>
                current.map((draft) =>
                  draft.key === active.key ? { ...draft, staffId } : draft,
                ),
              )
            }
          />
        </section>
      </fieldset>

      {!structurallyValid && (
        <p className="text-danger-dark text-xs">
          Choose an eligible staff member for every non-zero segment and keep
          all boundaries in order.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={saving || !canAddSegment}
          onClick={addSegment}
        >
          + Add Segment
        </Button>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={saving || !structurallyValid}
            onClick={() => void saveSplit(proposedSegments(), false)}
          >
            Save Split
          </Button>
        </div>
      </div>

      {pendingOverride && (
        <div
          className="border-danger/30 bg-danger-soft rounded-md border p-3"
          role="alertdialog"
          aria-labelledby="split-conflict-title"
        >
          <p
            id="split-conflict-title"
            className="text-danger-dark text-sm font-bold"
          >
            Review split conflicts
          </p>
          {pendingOverride.groups.length > 0 ? (
            <div className="mt-2 space-y-3">
              {pendingOverride.groups.map((group) => (
                <div key={`${group.segmentNumber}-${group.staffName}`}>
                  <p className="text-sm font-semibold">
                    {group.staffName} · {group.startTime}–{group.endTime}
                  </p>
                  <ul className="text-danger-dark mt-1 list-inside list-disc text-xs">
                    {group.conflicts.map((conflict) => (
                      <li key={conflict}>{conflict}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-danger-dark mt-2 text-xs">
              {pendingOverride.serverMessage}
            </p>
          )}
          <p className="mt-2 text-xs">
            Saving anyway records one administrator acknowledgement for this
            proposed split.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={saving}
              onClick={() => setPendingOverride(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={saving}
              onClick={() => void saveSplit(pendingOverride.segments, true)}
            >
              Save Split Anyway
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SegmentCandidatePicker({
  onRetry,
  candidates,
  error,
  staffId,
  onStaffChange,
}: {
  readonly onRetry: () => void;
  readonly candidates: readonly CandidatePreview[] | undefined;
  readonly error: string | undefined;
  readonly staffId: string;
  readonly onStaffChange: (staffId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [other, setOther] = useState(false);
  const recommended =
    candidates?.filter(
      (candidate) =>
        candidate.availability !== 'manual' && !candidate.conflicts.length,
    ) ?? [];
  const options = other
    ? (candidates ?? []).filter(
        (candidate) =>
          !recommended.includes(candidate) &&
          `${candidate.displayName} ${candidate.availabilitySource} ${candidate.conflicts.join(' ')}`
            .toLocaleLowerCase('en-US')
            .includes(search.trim().toLocaleLowerCase('en-US')),
      )
    : recommended;
  return (
    <div className="mt-2 space-y-3" aria-busy={!candidates && !error}>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={other ? 'secondary' : 'primary'}
          aria-pressed={!other}
          onClick={() => setOther(false)}
        >
          Recommended
        </Button>
        <Button
          size="sm"
          variant={other ? 'primary' : 'secondary'}
          aria-pressed={other}
          onClick={() => setOther(true)}
        >
          Other Staff
        </Button>
      </div>
      {other && (
        <Labeled label="Search Other Staff">
          <input
            className="field"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Labeled>
      )}
      {error ? (
        <div className="space-y-2">
          <ErrorBanner message={error} />
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Retry interval candidates
          </Button>
        </div>
      ) : !candidates ? (
        <CandidateSkeleton />
      ) : (
        <CandidateLedger
          candidates={options}
          selectedId={staffId}
          onSelect={(candidate) => onStaffChange(candidate.id)}
        />
      )}
    </div>
  );
}

function CandidateSkeleton() {
  return (
    <div className="border-border divide-border divide-y overflow-hidden rounded-md border">
      {[0, 1, 2].map((value) => (
        <div key={value} className="animate-pulse space-y-2 p-3">
          <div className="bg-muted h-4 w-40 rounded" />
          <div className="bg-muted h-3 w-72 rounded" />
        </div>
      ))}
    </div>
  );
}

function currentAssignmentLabel(assignment: PlanAssignment): string {
  const presented = assignmentResolutionLabel(assignment);
  if (presented !== 'Assigned') return presented;
  if (assignment.assignedStaff)
    return `${assignment.assignedStaff.displayName} · ${assignment.status}`;
  if (assignment.segments.length > 0)
    return assignment.segments
      .map(
        (segment) =>
          `${segment.staffName} ${segment.startTime}–${segment.endTime}`,
      )
      .join('; ');
  if (assignment.status === 'intentionally_uncovered')
    return 'Intentionally Uncovered';
  if (assignment.resolutionType)
    return assignment.resolutionType.replaceAll('_', ' ');
  return 'Unresolved';
}

function SharedDutyStaffing({
  staffing,
  activeAssignmentId,
  busy,
  onSelect,
  onClear,
}: {
  readonly staffing: NonNullable<PlanAssignment['sharedDutyStaffing']>;
  readonly activeAssignmentId: string;
  readonly busy: boolean;
  readonly onSelect: (assignmentId: string) => void;
  readonly onClear: (assignmentId: string) => void;
}) {
  const vacancies = staffing.positions.filter(
    (position) => position.absent && position.assignmentId,
  );
  return (
    <section>
      <h3 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
        Currently Chosen
      </h3>
      <div className="border-border mt-2 space-y-3 rounded-md border p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">Shared duty staffing</p>
          {staffing.actualStaff.length === 1 && (
            <Badge variant="warning">Solo (derived)</Badge>
          )}
        </div>
        <div>
          <p className="text-muted-foreground text-xs font-bold">Scheduled</p>
          <ul className="mt-1 space-y-1">
            {staffing.positions.map((position) => (
              <li
                key={position.scheduledStaff.id}
                className="flex items-center justify-between gap-3"
              >
                <span>{position.scheduledStaff.displayName}</span>
                <span
                  className={cn(
                    'text-xs font-semibold',
                    position.absent ? 'text-danger-dark' : 'text-brand-dark',
                  )}
                >
                  {position.absent ? 'Absent' : 'Present'}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-muted-foreground text-xs font-bold">
            Replacement coverage
          </p>
          <div className="mt-1 space-y-2">
            {vacancies.map((position, index) => {
              const assignmentId = position.assignmentId!;
              return (
                <div
                  key={assignmentId}
                  className={cn(
                    'border-border rounded-md border p-2',
                    assignmentId === activeAssignmentId &&
                      'border-brand bg-brand-soft/40',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onSelect(assignmentId)}
                      className="min-w-0 text-left"
                      aria-pressed={assignmentId === activeAssignmentId}
                    >
                      <span className="block text-xs font-bold">
                        Position {index + 1}: {sharedPositionChoice(position)}
                      </span>
                      <span className="text-muted-foreground block truncate text-[11px]">
                        Vacated by {position.scheduledStaff.displayName}
                      </span>
                    </button>
                    {position.hasExplicitResolution && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => onClear(assignmentId)}
                      >
                        Clear Resolution
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          {staffing.filledReplacementPositions} of {staffing.vacantPositions}{' '}
          vacant staffing position(s) have replacement coverage. The duty may
          still proceed with one actual staffer as derived Solo.
        </p>
      </div>
    </section>
  );
}

function sharedPositionChoice(
  position: NonNullable<
    PlanAssignment['sharedDutyStaffing']
  >['positions'][number],
): string {
  if (position.replacement) return position.replacement.displayName;
  if (position.segments.length > 0)
    return `Split — ${position.segments
      .map((segment) => segment.staffName)
      .join(' / ')}`;
  if (position.status === 'intentionally_uncovered')
    return 'Intentionally Uncovered';
  if (position.resolutionType === 'combine_class') return 'Combined Class';
  if (position.resolutionType === 'redistribution') return 'Redistribution';
  return 'Unassigned';
}

function CurrentChoice({
  assignment,
}: {
  readonly assignment: PlanAssignment;
}) {
  const note = assignmentNote(assignment.resolutionDetails);
  const plannedRoom =
    assignment.roomId !== assignment.scheduledRoomId
      ? formatRoomLabel(assignment.room)
      : null;
  return (
    <section>
      <h3 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
        Currently Chosen
      </h3>
      <div className="border-border mt-2 rounded-md border p-3 text-sm">
        {assignment.assignedStaff ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">
              {assignment.assignedStaff.displayName}
            </span>
            {assignment.resolutionSource && (
              <Badge>{assignment.resolutionSource}</Badge>
            )}
            {assignment.isDefault && <Badge variant="success">Default</Badge>}
          </div>
        ) : assignment.segments.length > 0 ? (
          <div className="space-y-1">
            <p className="font-semibold">Split Coverage</p>
            {assignment.segments.map((segment) => (
              <div key={segment.id}>
                <span className="font-semibold">{segment.staffName}</span>{' '}
                <span className="text-muted-foreground font-mono text-xs">
                  {segment.startTime}–{segment.endTime}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span>{currentAssignmentLabel(assignment)}</span>
        )}
        {(plannedRoom || note) && (
          <p className="text-muted-foreground mt-1 text-xs">
            {[plannedRoom, note].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </section>
  );
}

function AssignmentDetailsFields({
  assignment,
  rooms,
  roomsLoading,
  roomId,
  note,
  onRoomChange,
  onNoteChange,
}: {
  readonly assignment: PlanAssignment;
  readonly rooms: readonly RoomData[];
  readonly roomsLoading: boolean;
  readonly roomId: string;
  readonly note: string;
  readonly onRoomChange: (value: string) => void;
  readonly onNoteChange: (value: string) => void;
}) {
  const selectedRoom = roomId
    ? (rooms.find((room) => room.id === roomId)?.name ?? assignment.room)
    : assignment.scheduledRoom;
  const roomChanged = Boolean(roomId) && roomId !== assignment.scheduledRoomId;
  return (
    <div className="space-y-3">
      <Labeled label="Room">
        <select
          value={roomId}
          disabled={roomsLoading}
          onChange={(event) => onRoomChange(event.target.value)}
          className="field"
        >
          <option value="">
            Use scheduled room
            {assignment.scheduledRoom ? ` (${assignment.scheduledRoom})` : ''}
          </option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
      </Labeled>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <Data
          label="Scheduled room"
          value={formatRoomLabel(assignment.scheduledRoom) ?? '—'}
        />
        <Data
          label="Planned room"
          value={formatRoomLabel(selectedRoom ?? null) ?? '—'}
        />
      </dl>
      {!roomChanged && (
        <p className="text-muted-foreground text-xs">
          The planned room matches the scheduled room.
        </p>
      )}
      <Labeled label="Note">
        <textarea
          value={note}
          maxLength={500}
          rows={3}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Optional administrator context"
          className="field min-h-20 resize-y py-2"
        />
      </Labeled>
      <p className="text-muted-foreground text-right text-xs">
        {note.length}/500
      </p>
    </div>
  );
}

function combineEntryIdFrom(details: unknown): string {
  const value = detailsRecord(details).receivingScheduleEntryId;
  return typeof value === 'string' ? value : '';
}

function redistributionIds(details: unknown): string[] {
  const value = detailsRecord(details).receivingStaffIds;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function detailsRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasPrimaryResolution(assignment: PlanAssignment): boolean {
  if (assignment.status === 'unresolved') return false;
  if (assignment.resolutionType !== 'solo_coverage') return true;
  return (
    typeof detailsRecord(assignment.resolutionDetails).soloKind === 'string'
  );
}

function ErrorBanner({ message }: { readonly message: string }) {
  return (
    <div
      className="border-danger/30 bg-danger-soft text-danger-dark rounded-md border px-3 py-2 text-sm"
      role="alert"
    >
      {message}
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

function Data({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs font-semibold">{label}</dt>
      <dd className="mt-0.5 capitalize">{value}</dd>
    </div>
  );
}

function minutes(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function addMinutes(value: string, amount: number): string {
  const result = minutes(value) + amount;
  return `${String(Math.floor(result / 60)).padStart(2, '0')}:${String(result % 60).padStart(2, '0')}`;
}

function initialSplitDraft(
  assignment: PlanAssignment,
  snapMinutes: number,
): SplitDraftSegment[] {
  if (assignment.segments.length >= 2) {
    return [...assignment.segments]
      .sort((left, right) => left.startTime.localeCompare(right.startTime))
      .map((segment) => ({
        key: segment.id,
        staffId: segment.staffId,
        endTime: segment.endTime,
      }));
  }
  const boundary = defaultSplitBoundary(
    { startTime: assignment.startTime, endTime: assignment.endTime },
    snapMinutes,
  );
  return [
    { key: newSplitKey(), staffId: '', endTime: boundary },
    { key: newSplitKey(), staffId: '', endTime: assignment.endTime },
  ];
}

function splitBoundary(
  startTime: string,
  endTime: string,
  snapMinutes: number,
): string {
  const duration = minutes(endTime) - minutes(startTime);
  const snappedTrailingSegment = Math.max(1, snapMinutes);
  if (duration > snappedTrailingSegment) {
    return addMinutes(startTime, duration - snappedTrailingSegment);
  }
  return addMinutes(startTime, Math.max(1, Math.floor(duration / 2)));
}

let splitKeySequence = 0;

function newSplitKey(): string {
  splitKeySequence += 1;
  return `split-draft-${splitKeySequence}`;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'The request could not be completed.';
}
