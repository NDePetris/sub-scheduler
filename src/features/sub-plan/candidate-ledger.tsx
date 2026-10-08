import { Fragment } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CandidatePreview } from '@/lib/api';

/** Displays authoritative candidate previews in their existing ranked order. */
export function CandidateLedger({
  candidates,
  busy = false,
  selectedId,
  confirmingId,
  onSelect,
  onCancel,
  onConfirm,
}: {
  readonly candidates: readonly CandidatePreview[];
  readonly busy?: boolean;
  readonly selectedId?: string;
  readonly confirmingId?: string | null;
  readonly onSelect: (candidate: CandidatePreview) => void;
  readonly onCancel?: () => void;
  readonly onConfirm?: (candidate: CandidatePreview) => void;
}) {
  if (!candidates.length)
    return (
      <p className="border-border text-muted-foreground rounded-md border border-dashed p-3 text-sm">
        No matching candidates. Try Other Staff or another resolution.
      </p>
    );
  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table
        className="w-full table-fixed text-left text-xs"
        aria-label="Candidate comparison"
      >
        <caption className="bg-muted/40 px-3 py-2 text-left text-xs">
          Plan Periods Lost · Current = last {candidates[0]!.windowDays}{' '}
          calendar days · — = not available / not applicable
        </caption>
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th scope="col" className="w-[34%] p-2">
              Staff / availability
            </th>
            <th scope="col" className="w-[10%] p-2 text-right">
              Current
            </th>
            <th scope="col" className="w-[10%] p-2 text-right">
              Added
            </th>
            <th scope="col" className="w-[12%] p-2 text-right">
              Projected
            </th>
            <th scope="col" className="w-[17%] p-2">
              Warning
            </th>
            <th scope="col" className="w-[17%] p-2">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {candidates.map((candidate) => {
            const conflict = candidate.conflicts.length > 0;
            const threshold =
              candidate.projectedBurden !== null &&
              candidate.projectedBurden >= candidate.threshold;
            return (
              <Fragment key={candidate.id}>
                <tr
                  className={candidate.id === selectedId ? 'bg-brand-soft' : ''}
                >
                  <th
                    scope="row"
                    className="p-2 align-top font-normal wrap-anywhere"
                  >
                    <span className="block text-sm font-semibold">
                      {candidate.displayName}
                    </span>
                    <span className="text-muted-foreground">
                      {candidate.availabilitySource}
                    </span>
                    {candidate.isDefaultCandidate && (
                      <span className="ml-1">
                        <Badge variant="success">Default</Badge>
                      </span>
                    )}
                    <details className="text-muted-foreground mt-1">
                      <summary className="focus-visible:outline-brand-dark cursor-pointer focus-visible:outline-2">
                        Calculation details
                      </summary>
                      {candidate.isSchoolSub ? (
                        <p>
                          School Sub assignments do not add Plan Periods Lost.
                        </p>
                      ) : (
                        <p>
                          {candidate.standardPeriodMinutes
                            ? `${candidate.standardPeriodSource === 'auto' ? 'Auto: ' : ''}${candidate.standardPeriodMinutes}-minute standard period.`
                            : 'Standard period needs configuration.'}{' '}
                          {candidate.proposedBurden === 0 &&
                            'This assignment does not use PLAN time.'}
                        </p>
                      )}
                    </details>
                  </th>
                  <td className="p-2 text-right align-top tabular-nums">
                    {candidate.currentBurden?.toFixed(2) ?? '—'}
                  </td>
                  <td className="p-2 text-right align-top tabular-nums">
                    {candidate.isSchoolSub
                      ? '0'
                      : (candidate.proposedBurden?.toFixed(2) ?? '—')}
                  </td>
                  <td className="p-2 text-right align-top font-semibold tabular-nums">
                    {candidate.projectedBurden?.toFixed(2) ?? '—'}
                  </td>
                  <td className="p-2 align-top wrap-anywhere">
                    {conflict && (
                      <span className="text-danger-dark font-semibold">
                        Conflict
                      </span>
                    )}
                    {threshold && (
                      <span className="text-warning-dark block font-semibold">
                        Workload Warning · threshold{' '}
                        {candidate.threshold.toFixed(2)}
                      </span>
                    )}
                    {candidate.warnings.map((warning) => (
                      <p key={warning} className="text-warning-dark">
                        {warning}
                      </p>
                    ))}
                    {!conflict && !threshold && !candidate.warnings.length && (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {conflict && (
                      <details>
                        <summary className="focus-visible:outline-brand-dark cursor-pointer focus-visible:outline-2">
                          View conflicts
                        </summary>
                        {candidate.conflicts.map((text) => (
                          <p key={text} className="text-danger-dark">
                            {text}
                          </p>
                        ))}
                      </details>
                    )}
                  </td>
                  <td className="p-2 align-top">
                    <Button
                      className="h-auto min-h-8 w-full px-2 py-1 whitespace-normal"
                      size="sm"
                      variant={
                        conflict || selectedId !== undefined
                          ? 'secondary'
                          : 'primary'
                      }
                      disabled={busy}
                      aria-label={`${selectedId !== undefined ? 'Select' : conflict ? 'Review Conflict for' : 'Assign'} ${candidate.displayName}`}
                      aria-pressed={
                        selectedId !== undefined
                          ? selectedId === candidate.id
                          : undefined
                      }
                      onClick={() => onSelect(candidate)}
                    >
                      {selectedId !== undefined
                        ? selectedId === candidate.id
                          ? 'Selected'
                          : 'Select'
                        : conflict
                          ? 'Review Conflict'
                          : 'Assign'}
                    </Button>
                  </td>
                </tr>
                {confirmingId === candidate.id && (
                  <tr>
                    <td colSpan={6} className="bg-danger-soft p-3">
                      <div role="alert" className="text-danger-dark">
                        <p className="font-bold">
                          {candidate.displayName} has a conflict
                        </p>
                        <ul className="mt-1 list-inside list-disc">
                          {candidate.conflicts.map((text) => (
                            <li key={text}>{text}</li>
                          ))}
                        </ul>
                        <p className="mt-2">
                          Assign Anyway records an administrator override.
                        </p>
                        <div className="mt-2 flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={onCancel}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => onConfirm?.(candidate)}
                          >
                            Assign Anyway
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
