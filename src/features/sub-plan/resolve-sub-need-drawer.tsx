import { AlertTriangle, Search, Split, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
  getCandidatesWithSolo,
  listRooms,
  resolveAssignment,
  type AssignmentResolutionInput,
  type CandidatePreview,
  type PlanAssignment,
  type PlanDetail,
  type RoomData,
  type StaffData,
  type SoloCandidate,
} from '@/lib/api';

export function ResolveSubNeedDrawer({
  assignment,
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
  const [candidates, setCandidates] = useState<CandidatePreview[]>([]);
  const [soloCandidates, setSoloCandidates] = useState<SoloCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingCandidateId, setConfirmingCandidateId] = useState<
    string | null
  >(null);
  const [otherStaffSearch, setOtherStaffSearch] = useState('');
  const [splitOpen, setSplitOpen] = useState(false);
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
    const controller = new AbortController();
    void getCandidatesWithSolo(assignment.id, controller.signal)
      .then((values) => {
        setCandidates(values.candidates);
        setSoloCandidates(values.soloCandidates);
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setCandidateError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCandidatesLoading(false);
      });
    return () => controller.abort();
  }, [assignment.id]);

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

  async function act(input: AssignmentResolutionInput) {
    setBusy(true);
    setActionError(null);
    setPendingOverride(null);
    try {
      onChange(await resolveAssignment(assignment.id, input));
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

  return (
    <div
      className="fixed inset-0 z-40 bg-black/20"
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="resolve-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="border-border absolute inset-y-0 right-0 w-[580px] overflow-y-auto border-l bg-white shadow-xl"
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
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-5 p-5">
          {actionError && <ErrorBanner message={actionError} />}
          {pendingOverride && (
            <div className="border-danger/30 bg-danger-soft rounded-md border p-3">
              <p className="text-danger-dark text-sm font-bold">
                This choice has an operational conflict.
              </p>
              <p className="mt-1 text-xs">
                Review the warning above, then explicitly acknowledge it to save
                this resolution.
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
          <section className="bg-muted grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg p-4 text-sm">
            <Data
              label="Time"
              value={`${assignment.startTime}–${assignment.endTime}`}
            />
            <Data
              label="Absent Teacher"
              value={assignment.absentStaff.displayName}
            />
            <Data
              label="Type"
              value={assignment.responsibilityType.replace('_', ' ')}
            />
            <Data label="Room" value={assignment.room ?? '—'} />
            <div className="col-span-2">
              <Data
                label="Class / Responsibility"
                value={assignment.description}
              />
            </div>
          </section>

          {assignment.status !== 'unresolved' && (
            <CurrentChoice assignment={assignment} />
          )}

          {soloCandidates.length > 0 && (
            <section className="border-border bg-muted/40 rounded-lg border p-4">
              <h3 className="text-base font-bold">
                Handle this responsibility solo
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {soloCandidates[0]?.kind === 'scheduled'
                  ? 'Already scheduled co-assignees can handle this duty without consuming PLAN time.'
                  : 'Assign one available person to handle the shared responsibility alone.'}
              </p>
              <div className="border-border divide-border mt-3 divide-y overflow-hidden rounded-md border">
                {soloCandidates
                  .filter((candidate) => candidate.conflicts.length === 0)
                  .map((candidate) => (
                    <div
                      key={candidate.id}
                      className="flex items-center justify-between gap-3 p-3 text-sm"
                    >
                      <span>
                        <span className="font-semibold">
                          {candidate.displayName}
                        </span>
                        {candidate.kind === 'scheduled'
                          ? ' — already scheduled'
                          : ' — newly assigned'}
                      </span>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void act({
                            action: 'solo_coverage',
                            staffId: candidate.id,
                            assignAnyway: false,
                          })
                        }
                      >
                        Handles Solo
                      </Button>
                    </div>
                  ))}
              </div>
            </section>
          )}

          <section aria-labelledby="assign-a-sub-title">
            <div>
              <h3 id="assign-a-sub-title" className="text-base font-bold">
                Assign a Sub
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Recommended staff are automatically available and ordered by
                preference, then recent Plan Periods Lost.
              </p>
              {assignment.status === 'unresolved' &&
                assignment.defaultAction &&
                assignment.conflictExplanation && (
                  <p className="text-danger-dark mt-2 flex gap-1.5 text-xs">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    Default unavailable: {assignment.conflictExplanation}
                  </p>
                )}
            </div>

            <div className="mt-3 space-y-3" aria-busy={candidatesLoading}>
              <h4 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
                Recommended
              </h4>
              {candidatesLoading ? (
                <CandidateSkeleton />
              ) : candidateError ? (
                <ErrorBanner message={candidateError} />
              ) : recommended.length > 0 ? (
                <div className="border-border divide-border divide-y overflow-hidden rounded-md border">
                  {recommended.map((candidate) => (
                    <CandidateCard
                      key={candidate.id}
                      candidate={candidate}
                      busy={busy}
                      confirming={confirmingCandidateId === candidate.id}
                      onRequestAssign={() =>
                        candidate.conflicts.length > 0
                          ? setConfirmingCandidateId(candidate.id)
                          : void act({
                              action: 'assign',
                              staffId: candidate.id,
                              assignAnyway: false,
                            })
                      }
                      onCancelOverride={() => setConfirmingCandidateId(null)}
                      onConfirmOverride={() => {
                        setConfirmingCandidateId(null);
                        void act({
                          action: 'assign',
                          staffId: candidate.id,
                          assignAnyway: true,
                        });
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className="border-border text-muted-foreground rounded-md border border-dashed p-3 text-sm">
                  No staff are automatically available for the full Assignment.
                  Check Other Staff to make an override.
                </p>
              )}

              {!candidatesLoading && !candidateError && otherStaffCount > 0 && (
                <details className="border-border rounded-md border">
                  <summary className="hover:bg-muted/40 cursor-pointer px-3 py-2.5 text-sm font-semibold">
                    Other Staff ({otherStaffCount})
                  </summary>
                  <div className="border-border border-t p-3">
                    <label className="border-border mb-3 flex h-8 items-center gap-2 rounded-md border bg-white px-2">
                      <Search className="text-muted-foreground size-3.5" />
                      <span className="sr-only">Search Other Staff</span>
                      <input
                        value={otherStaffSearch}
                        onChange={(event) =>
                          setOtherStaffSearch(event.target.value)
                        }
                        placeholder="Search Other Staff"
                        className="w-full bg-transparent text-xs outline-none"
                      />
                    </label>
                    {otherStaff.length > 0 ? (
                      <div className="border-border divide-border divide-y overflow-hidden rounded-md border">
                        {otherStaff.map((candidate) => (
                          <CandidateCard
                            key={candidate.id}
                            candidate={candidate}
                            busy={busy}
                            confirming={confirmingCandidateId === candidate.id}
                            onRequestAssign={() =>
                              candidate.conflicts.length > 0
                                ? setConfirmingCandidateId(candidate.id)
                                : void act({
                                    action: 'assign',
                                    staffId: candidate.id,
                                    assignAnyway: false,
                                  })
                            }
                            onCancelOverride={() =>
                              setConfirmingCandidateId(null)
                            }
                            onConfirmOverride={() => {
                              setConfirmingCandidateId(null);
                              void act({
                                action: 'assign',
                                staffId: candidate.id,
                                assignAnyway: true,
                              });
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        No staff match this search.
                      </p>
                    )}
                  </div>
                </details>
              )}
            </div>
          </section>

          <section className="bg-muted/40 border-border space-y-2 rounded-lg border p-4">
            <div>
              <h3 className="text-sm font-bold">
                Other ways to resolve this need
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Use these less-common options when a normal sub assignment is
                not the right fit.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSplitOpen((value) => !value)}
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
                Leave Uncovered
              </Button>
            </div>
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
                            assignment.roomId === assignment.scheduledRoomId &&
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
                        No concurrent instructional classes are available for
                        this Assignment.
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
                          (person) => person.id !== assignment.absentStaff.id,
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
                                    : current.filter((id) => id !== person.id),
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
                  Leave instructional coverage unresolved?
                </p>
                <p className="mt-1 text-xs">
                  This Assignment is instructional. Confirming will record the
                  administrator override as Intentionally Uncovered.
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
                    Leave Uncovered Anyway
                  </Button>
                </div>
              </div>
            )}
            {splitOpen && (
              <SplitAssignmentEditor
                assignment={assignment}
                snapMinutes={detail.settings.splitSnapMinutes}
                onCancel={() => setSplitOpen(false)}
                onChange={onChange}
              />
            )}
          </section>

          {!alternateEditor && (
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
        </div>
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
  snapMinutes,
  onCancel,
  onChange,
}: {
  readonly assignment: PlanAssignment;
  readonly snapMinutes: number;
  readonly onCancel: () => void;
  readonly onChange: (detail: PlanDetail) => void;
}) {
  const [drafts, setDrafts] = useState<SplitDraftSegment[]>(() =>
    initialSplitDraft(assignment, snapMinutes),
  );
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

  const handleCandidatesLoaded = useCallback(
    (key: string, values: readonly CandidatePreview[]) => {
      setCandidateMap((current) => ({ ...current, [key]: values }));
    },
    [],
  );

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
      const selected = candidateMap[segment.key]?.find(
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

      <div className="space-y-3">
        {intervals.map((segment, index) => (
          <section
            key={segment.key}
            className="border-border rounded-md border p-3"
            aria-labelledby={`split-segment-${segment.key}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h5
                  id={`split-segment-${segment.key}`}
                  className="text-sm font-bold"
                >
                  Segment {index + 1}
                </h5>
                <p className="text-muted-foreground font-mono text-xs">
                  {segment.startTime}–{segment.endTime}
                </p>
              </div>
              {drafts.length > 2 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeSegment(index)}
                >
                  Remove
                </Button>
              )}
            </div>

            {index < intervals.length - 1 && (
              <div className="mt-3 max-w-44">
                <Labeled label="Ends at">
                  <input
                    type="time"
                    step={snapMinutes * 60}
                    min={segment.startTime}
                    max={intervals[index + 1]!.endTime}
                    value={segment.endTime}
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
              </div>
            )}

            <SegmentCandidatePicker
              assignmentId={assignment.id}
              segmentKey={segment.key}
              startTime={segment.startTime}
              endTime={segment.endTime}
              staffId={segment.staffId}
              onStaffChange={(staffId) =>
                updateDrafts((current) =>
                  current.map((draft) =>
                    draft.key === segment.key ? { ...draft, staffId } : draft,
                  ),
                )
              }
              onCandidatesLoaded={handleCandidatesLoaded}
            />
          </section>
        ))}
      </div>

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
          disabled={!canAddSegment}
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
  assignmentId,
  segmentKey,
  startTime,
  endTime,
  staffId,
  onStaffChange,
  onCandidatesLoaded,
}: {
  readonly assignmentId: string;
  readonly segmentKey: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly staffId: string;
  readonly onStaffChange: (staffId: string) => void;
  readonly onCandidatesLoaded: (
    key: string,
    values: readonly CandidatePreview[],
  ) => void;
}) {
  const requestKey = `${startTime}-${endTime}`;
  const [response, setResponse] = useState<{
    readonly key: string;
    readonly candidates: CandidatePreview[];
    readonly error: string | null;
  }>({ key: '', candidates: [], error: null });
  const [search, setSearch] = useState('');
  const loading = response.key !== requestKey;
  const candidates = loading ? [] : response.candidates;
  const error = loading ? null : response.error;

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      onCandidatesLoaded(segmentKey, []);
      void getCandidates(assignmentId, {
        startTime,
        endTime,
        signal: controller.signal,
      })
        .then((values) => {
          setResponse({ key: requestKey, candidates: values, error: null });
          onCandidatesLoaded(segmentKey, values);
        })
        .catch((cause: unknown) => {
          if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
            setResponse({
              key: requestKey,
              candidates: [],
              error: errorMessage(cause),
            });
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    assignmentId,
    endTime,
    onCandidatesLoaded,
    requestKey,
    segmentKey,
    startTime,
  ]);

  const recommended = candidates.filter(
    (candidate) =>
      candidate.availability !== 'manual' && candidate.conflicts.length === 0,
  );
  const other = candidates.filter((candidate) => {
    if (recommended.includes(candidate)) return false;
    const query = search.trim().toLocaleLowerCase('en-US');
    return (
      !query ||
      `${candidate.displayName} ${candidate.availabilitySource} ${candidate.conflicts.join(' ')}`
        .toLocaleLowerCase('en-US')
        .includes(query)
    );
  });
  const selected = candidates.find((candidate) => candidate.id === staffId);

  return (
    <div className="mt-3 space-y-2" aria-busy={loading}>
      <p className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
        Recommended
      </p>
      {loading ? (
        <div className="bg-muted h-16 animate-pulse rounded-md" />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : recommended.length > 0 ? (
        <div className="space-y-1.5">
          {recommended.map((candidate) => (
            <SegmentCandidateOption
              key={candidate.id}
              candidate={candidate}
              selected={candidate.id === staffId}
              onSelect={() => onStaffChange(candidate.id)}
            />
          ))}
        </div>
      ) : (
        <p className="border-border text-muted-foreground rounded-md border border-dashed p-2 text-xs">
          No staff are automatically available for this segment.
        </p>
      )}

      {!loading && !error && candidates.length > recommended.length && (
        <details className="border-border rounded-md border">
          <summary className="hover:bg-muted/40 cursor-pointer px-2.5 py-2 text-xs font-semibold">
            Other Staff ({candidates.length - recommended.length})
          </summary>
          <div className="border-border space-y-2 border-t p-2">
            <label className="border-border flex h-8 items-center gap-2 rounded-md border px-2">
              <Search className="text-muted-foreground size-3.5" />
              <span className="sr-only">Search Other Staff</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search Other Staff"
                className="w-full bg-transparent text-xs outline-none"
              />
            </label>
            {other.map((candidate) => (
              <SegmentCandidateOption
                key={candidate.id}
                candidate={candidate}
                selected={candidate.id === staffId}
                onSelect={() => onStaffChange(candidate.id)}
              />
            ))}
          </div>
        </details>
      )}

      {staffId && !selected && !loading && !error && (
        <p className="text-danger-dark text-xs">
          The previously selected staff member is no longer eligible.
        </p>
      )}
    </div>
  );
}

function SegmentCandidateOption({
  candidate,
  selected,
  onSelect,
}: {
  readonly candidate: CandidatePreview;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const thresholdWarning =
    candidate.projectedBurden !== null &&
    candidate.projectedBurden >= candidate.threshold;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`w-full rounded-md border p-2 text-left transition-colors ${
        selected
          ? 'border-brand bg-brand-soft/40'
          : 'border-border hover:bg-muted/40'
      }`}
    >
      <span className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="font-semibold">{candidate.displayName}</span>
        <Badge>{availabilityLabel(candidate)}</Badge>
        {candidate.isDefaultCandidate && (
          <Badge className="border-brand/30 bg-brand-soft text-brand-dark">
            Default
          </Badge>
        )}
        {thresholdWarning && (
          <Badge className="border-warning/40 bg-warning-soft text-warning-dark">
            <AlertTriangle className="size-3" aria-hidden="true" />
            Workload Warning
          </Badge>
        )}
      </span>
      <SegmentWorkload candidate={candidate} />
      {candidate.conflicts.map((conflict) => (
        <span
          key={conflict}
          className="text-danger-dark mt-1 flex gap-1.5 text-xs"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {conflict}
        </span>
      ))}
      {candidate.warnings
        .filter((warning) => warning.startsWith('Plan-time calculation needs'))
        .map((warning) => (
          <span
            key={warning}
            className="border-warning/40 bg-warning-soft text-warning-dark mt-1 block rounded border px-2 py-1 text-xs"
          >
            {warning}
          </span>
        ))}
      {thresholdWarning && (
        <span className="border-warning/40 bg-warning-soft text-warning-dark mt-1 block rounded border px-2 py-1 text-xs">
          After assignment, {candidate.projectedBurden?.toFixed(2)} Plan Periods
          Lost reaches the {candidate.threshold.toFixed(2)} warning threshold.
        </span>
      )}
    </button>
  );
}

function SegmentWorkload({
  candidate,
}: {
  readonly candidate: CandidatePreview;
}) {
  const current = candidate.currentBurden?.toFixed(2) ?? 'Unknown';
  const proposed =
    candidate.proposedBurden === null
      ? 'Unknown'
      : `+${candidate.proposedBurden.toFixed(2)}`;
  const projected = candidate.projectedBurden?.toFixed(2) ?? 'Unknown';
  return (
    <span className="text-muted-foreground mt-1 block text-xs">
      Last {candidate.windowDays} days: {current} · This segment: {proposed} ·
      After assignment: {projected}
    </span>
  );
}

function CandidateCard({
  candidate,
  busy,
  confirming,
  onRequestAssign,
  onCancelOverride,
  onConfirmOverride,
}: {
  readonly candidate: CandidatePreview;
  readonly busy: boolean;
  readonly confirming: boolean;
  readonly onRequestAssign: () => void;
  readonly onCancelOverride: () => void;
  readonly onConfirmOverride: () => void;
}) {
  const thresholdWarning =
    candidate.projectedBurden !== null &&
    candidate.projectedBurden >= candidate.threshold;
  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">{candidate.displayName}</span>
            <Badge>{availabilityLabel(candidate)}</Badge>
            {candidate.isDefaultCandidate && (
              <Badge className="border-brand/30 bg-brand-soft text-brand-dark">
                Default
              </Badge>
            )}
            {thresholdWarning && (
              <Badge className="border-warning/40 bg-warning-soft text-warning-dark">
                <AlertTriangle className="size-3" aria-hidden="true" />
                Workload Warning
              </Badge>
            )}
          </div>
          <WorkloadSummary candidate={candidate} />
          {candidate.conflicts.map((conflict) => (
            <p
              key={conflict}
              className="text-danger-dark mt-1 flex gap-1.5 text-xs"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {conflict}
            </p>
          ))}
          {candidate.warnings
            .filter((warning) =>
              warning.startsWith('Plan-time calculation needs'),
            )
            .map((warning) => (
              <p
                key={warning}
                className="border-warning/40 bg-warning-soft text-warning-dark mt-2 rounded border px-2 py-1.5 text-xs font-semibold"
              >
                {warning}
              </p>
            ))}
          {thresholdWarning && (
            <p className="border-warning/40 bg-warning-soft text-warning-dark mt-2 rounded border px-2 py-1.5 text-xs font-semibold">
              After assignment, {candidate.projectedBurden.toFixed(2)} Plan
              Periods Lost reaches the {candidate.threshold.toFixed(2)} warning
              threshold.
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant={candidate.conflicts.length ? 'secondary' : 'primary'}
          disabled={busy}
          onClick={onRequestAssign}
        >
          {candidate.conflicts.length ? 'Review conflict' : 'Assign'}
        </Button>
      </div>

      {confirming && (
        <div
          className="border-danger/30 bg-danger-soft mt-3 rounded-md border p-3"
          role="alertdialog"
          aria-labelledby={`conflict-title-${candidate.id}`}
          aria-describedby={`conflict-description-${candidate.id}`}
        >
          <p
            id={`conflict-title-${candidate.id}`}
            className="text-danger-dark text-sm font-bold"
          >
            {candidate.displayName} has a conflict
          </p>
          <ul
            id={`conflict-description-${candidate.id}`}
            className="text-danger-dark mt-1 list-inside list-disc space-y-1 text-xs"
          >
            {candidate.conflicts.map((conflict) => (
              <li key={conflict}>{conflict}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            The administrator may override these warnings. The override will be
            recorded with the Assignment.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={onCancelOverride}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={busy} onClick={onConfirmOverride}>
              Assign Anyway
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkloadSummary({
  candidate,
}: {
  readonly candidate: CandidatePreview;
}) {
  if (candidate.isSchoolSub) {
    return (
      <p className="text-muted-foreground mt-1 text-xs">
        School Sub assignments do not add Plan Periods Lost.
      </p>
    );
  }
  if (candidate.currentBurden === null || candidate.proposedBurden === null) {
    return null;
  }
  if (candidate.proposedBurden === 0) {
    return (
      <p className="text-muted-foreground mt-1 text-xs">
        <span className="font-semibold">Last {candidate.windowDays} days:</span>{' '}
        {candidate.currentBurden.toFixed(2)} · This assignment does not use plan
        time.
      </p>
    );
  }
  return (
    <dl className="text-muted-foreground mt-1 grid grid-cols-3 gap-2 text-xs">
      <div>
        <dt className="font-semibold">Last {candidate.windowDays} days</dt>
        <dd>{candidate.currentBurden.toFixed(2)}</dd>
      </div>
      <div>
        <dt className="font-semibold">This assignment</dt>
        <dd>+{candidate.proposedBurden.toFixed(2)}</dd>
        <dd>
          {candidate.standardPeriodSource === 'auto' ? 'Auto: ' : ''}
          {candidate.standardPeriodMinutes}-minute standard period
        </dd>
      </div>
      <div>
        <dt className="font-semibold">After assignment</dt>
        <dd>
          {candidate.projectedBurden?.toFixed(2) ?? 'Needs configuration'}
        </dd>
      </div>
    </dl>
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

function availabilityLabel(candidate: CandidatePreview): string {
  if (candidate.availability === 'school_sub') return 'School Sub';
  if (candidate.availability === 'plan') return 'PLAN';
  if (candidate.availability === 'admin') return 'Admin';
  if (candidate.availability === 'open') return 'Available';
  if (candidate.availability === 'manual') return 'Manual';
  if (candidate.availabilitySource === 'School Sub') return 'School Sub';
  if (candidate.availabilitySource === 'Plan Period') return 'PLAN';
  if (candidate.availabilitySource === 'Admin') return 'Admin';
  if (candidate.availabilitySource === 'Available') return 'Available';
  return 'Manual';
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
            {assignment.isDefault && (
              <Badge className="border-brand/30 bg-brand-soft text-brand-dark">
                Default
              </Badge>
            )}
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
