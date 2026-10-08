// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/core-workspace.json';
import {
  ApiError,
  type CandidatePreview,
  type PlanDetail,
  type StaffData,
  type BootstrapData,
} from '../../src/lib/api';
import { ResolveSubNeedDrawer } from '../../src/features/sub-plan/resolve-sub-need-drawer';
import { CandidateLedger } from '../../src/features/sub-plan/candidate-ledger';
import { SubPlanWorkspace } from '../../src/features/sub-plan/sub-plan-workspace';
const api = vi.hoisted(() => ({
  getCandidates: vi.fn(),
  listRooms: vi.fn(),
  resolveAssignment: vi.fn(),
  listStaff: vi.fn(),
  ensurePlan: vi.fn(),
}));
vi.mock('../../src/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/api')>()),
  ...api,
}));
const detail = fixture.detail as PlanDetail;
const staff = fixture.staff as StaffData[];
const candidates = fixture.candidates as CandidatePreview[];
beforeEach(() => {
  api.getCandidates.mockResolvedValue(candidates);
  api.listRooms.mockResolvedValue([]);
  api.resolveAssignment.mockResolvedValue(detail);
  api.listStaff.mockResolvedValue(staff);
  api.ensurePlan.mockResolvedValue(detail);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function drawer(index = 1, plan = detail) {
  const onChange = vi.fn();
  render(
    <ResolveSubNeedDrawer
      assignment={plan.assignments[index]}
      detail={plan}
      staff={staff}
      onClose={vi.fn()}
      onChange={onChange}
    />,
  );
  return onChange;
}
async function split() {
  drawer();
  fireEvent.click(screen.getByRole('button', { name: 'Split Assignment' }));
  await screen.findByRole('button', { name: 'Select Morgan Ellis' });
}
describe('Comparison ledger', () => {
  it('aligns authoritative values and sources without reordering or inventing workload', () => {
    render(<CandidateLedger candidates={candidates} onSelect={vi.fn()} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    rows.forEach((row, index) => {
      expect(within(row).getByRole('rowheader').textContent).toContain(
        candidates[index].displayName,
      );
    });
    const school = rows.find((row) =>
      row.textContent?.includes('Riley Quinn'),
    )!;
    expect(
      within(school)
        .getAllByRole('cell')
        .slice(0, 3)
        .map((cell) => cell.textContent),
    ).toEqual(['—', '0', '—']);
    for (const source of [
      'Plan Period',
      'Admin',
      'Available',
      'School Sub',
      'Default',
    ])
      expect(screen.getAllByText(source).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('50-minute standard period.', { exact: false })[0],
    ).toBeTruthy();
  });
  it('shows threshold and unknown-calculation warnings', () => {
    render(
      <CandidateLedger
        candidates={[
          {
            ...candidates[0],
            projectedBurden: 5,
            warnings: ['Plan-time calculation needs configuration.'],
          },
        ]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/Workload Warning/)).toBeTruthy();
    expect(
      screen.getByText('Plan-time calculation needs configuration.'),
    ).toBeTruthy();
  });
});
describe('Resolve Sub Need', () => {
  it('keeps invalid Default identity and reason together, then assigns directly', async () => {
    const changed = drawer();
    const context = screen.getByText('Default Sub Plan:').parentElement!;
    expect(context.textContent).toContain('Theo Wallace');
    expect(context.textContent).toContain('teaching during this interval');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Assign Morgan Ellis' }),
    );
    await waitFor(() =>
      expect(api.resolveAssignment).toHaveBeenCalledWith('a1', {
        action: 'assign',
        staffId: 's3',
        assignAnyway: false,
      }),
    );
    await waitFor(() => expect(changed).toHaveBeenCalledWith(detail));
  });
  it('searches Other Staff and requires a separate conflict acknowledgement', async () => {
    drawer();
    await screen.findByRole('button', { name: 'Assign Morgan Ellis' });
    fireEvent.click(screen.getByRole('button', { name: /Other Staff/ }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search Other Staff' }),
      { target: { value: 'Theo' } },
    );
    expect(
      within(
        screen.getByRole('table', { name: 'Candidate comparison' }),
      ).queryByText('Jordan Kim'),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review Conflict for Theo Wallace' }),
    );
    expect(api.resolveAssignment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Assign Anyway' }));
    await waitFor(() =>
      expect(api.resolveAssignment).toHaveBeenCalledWith('a1', {
        action: 'assign',
        staffId: 's6',
        assignAnyway: true,
      }),
    );
  });
  it('preserves alternate-resolution payloads and instructional acknowledgement', async () => {
    drawer();
    fireEvent.click(screen.getByRole('button', { name: 'Combine Class' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Combined Class' }),
    );
    await waitFor(() =>
      expect(api.resolveAssignment).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({
          action: 'combine_class',
          receivingScheduleEntryId: 'e-receiver',
          overrideAcknowledged: false,
        }),
      ),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Redistribute Class' })
          .matches(':disabled'),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Redistribute Class' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Morgan Ellis' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Priya Nair' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Redistribution' }),
    );
    await waitFor(() =>
      expect(api.resolveAssignment).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({
          action: 'redistribute',
          receivingStaffIds: ['s3', 's5'],
          overrideAcknowledged: false,
        }),
      ),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Mark Intentionally Uncovered' })
          .matches(':disabled'),
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark Intentionally Uncovered' }),
    );
    expect(api.resolveAssignment).toHaveBeenCalledTimes(2);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Mark Intentionally Uncovered Anyway',
      }),
    );
    await waitFor(() =>
      expect(api.resolveAssignment).toHaveBeenCalledWith('a1', {
        action: 'leave_uncovered',
        acknowledged: true,
      }),
    );
  });
  it('makes finalized controls read only, including Clear Resolution', () => {
    drawer(0, { ...detail, plan: { ...detail.plan, status: 'finalized' } });
    expect(screen.getByText(/Finalized · Read only/)).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Clear Resolution' })
        .matches(':disabled'),
    ).toBe(true);
    expect(
      screen.queryByRole('button', { name: 'Split Assignment' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Assign Morgan Ellis' }),
    ).toBeNull();
  });
  it('renders API errors without discarding the current need', async () => {
    api.getCandidates.mockRejectedValue(
      new Error('Candidates unavailable. Try again.'),
    );
    drawer();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(
      screen.getByText('Default Sub Plan:').parentElement?.textContent,
    ).toContain('Theo Wallace');
  });
});
describe('Dedicated split editor', () => {
  it('uses one picker, preserves drafts and sends fixed adjacent intervals', async () => {
    await split();
    expect(
      screen.getAllByRole('table', { name: 'Candidate comparison' }),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Select Morgan Ellis' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Segment 2 ·/ }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Select Priya Nair' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Segment 1 ·/ }));
    expect(
      screen
        .getByRole('button', { name: 'Select Morgan Ellis' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: /Segment 2 ·/ }).textContent,
    ).toContain('Priya Nair');
    fireEvent.click(screen.getByRole('button', { name: 'Save Split' }));
    await waitFor(() =>
      expect(api.resolveAssignment).toHaveBeenCalledWith('a1', {
        action: 'split',
        assignAnyway: false,
        segments: [
          { staffId: 's3', startTime: '08:00', endTime: '08:40' },
          { staffId: 's5', startTime: '08:40', endTime: '08:50' },
        ],
      }),
    );
  });
  it('keeps incomplete/invalid segments visible and updates both sides of boundaries', async () => {
    await split();
    expect(
      screen.getByRole('button', { name: 'Save Split' }).matches(':disabled'),
    ).toBe(true);
    const input = screen.getByLabelText('Segment 1 ends at');
    expect(input.getAttribute('step')).toBe('600');
    fireEvent.change(input, { target: { value: '08:40' } });
    expect(
      screen.getByRole('button', { name: /Segment 2 · 08:40–08:50/ })
        .textContent,
    ).toContain('Incomplete');
    await waitFor(() =>
      expect(api.getCandidates).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ startTime: '08:40', endTime: '08:50' }),
      ),
    );
    fireEvent.change(input, { target: { value: '08:50' } });
    expect(
      screen.getByRole('button', { name: /Segment 2 ·/ }).textContent,
    ).toContain('Invalid boundary');
    expect(
      screen.getByRole('button', { name: 'Save Split' }).matches(':disabled'),
    ).toBe(true);
    fireEvent.change(input, { target: { value: '08:30' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add Segment' }));
    expect(
      screen.getAllByRole('button', { name: /Segment \d ·/ }),
    ).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Remove segment 2' }));
    expect(
      screen.getAllByRole('button', { name: /Segment \d ·/ }),
    ).toHaveLength(2);
  });
  it('keeps conflicts visible on inactive segments and acknowledges the entire split once', async () => {
    await split();
    const active = screen.getByRole('region', {
      name: 'Active split interval',
    });
    fireEvent.click(
      within(active).getByRole('button', { name: 'Other Staff' }),
    );
    fireEvent.click(
      within(active).getByRole('button', { name: 'Select Theo Wallace' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Segment 2 ·/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Select Morgan Ellis' }),
    );
    expect(
      screen.getByRole('button', { name: /Segment 1 ·/ }).textContent,
    ).toContain('Conflict');
    api.resolveAssignment.mockRejectedValueOnce(
      new ApiError(
        'override_acknowledgement_required',
        'Conflict requires acknowledgement',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Split' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save Split Anyway' }),
    );
    await waitFor(() =>
      expect(api.resolveAssignment).toHaveBeenLastCalledWith(
        'a1',
        expect.objectContaining({ action: 'split', assignAnyway: true }),
      ),
    );
  });
});
describe('Daily Sub Plan context', () => {
  it('preserves filters and sort across opening and closing the drawer', async () => {
    render(<SubPlanWorkspace bootstrap={fixture.bootstrap as BootstrapData} />);
    await screen.findByRole('region', { name: 'Daily Sub Plan Assignments' });
    fireEvent.click(screen.getByRole('button', { name: 'classes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Absent Teacher' }));
    const table = screen.getByRole('region', {
      name: 'Daily Sub Plan Assignments',
    });
    const before = table.textContent;
    fireEvent.click(within(table).getAllByRole('button')[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(table.textContent).toBe(before);
  });
});

describe('Candidate recovery and freshness', () => {
  it('refreshes a retained shared-duty slot when its authoritative revision changes and ignores obsolete responses', async () => {
    let oldResponse!: (values: CandidatePreview[]) => void;
    api.getCandidates.mockReturnValueOnce(
      new Promise<CandidatePreview[]>((resolve) => {
        oldResponse = resolve;
      }),
    );
    const assignment = {
      ...detail.assignments[0],
      sharedResponsibilityKey: 'shared',
      sharedDutyStaffing: {
        capacity: 2,
        vacantPositions: 1,
        filledReplacementPositions: 1,
        actualStaff: [
          {
            id: 's3',
            displayName: 'Morgan Ellis',
            kind: 'replacement' as const,
          },
        ],
        positions: [
          {
            scheduledStaff: { id: 's0', displayName: 'Avery Bennett' },
            absent: true,
            assignmentId: 'a0',
            replacement: { id: 's3', displayName: 'Morgan Ellis' },
            segments: [],
            status: 'assigned' as const,
            resolutionType: 'staff',
            resolutionDetails: null,
            hasExplicitResolution: true,
          },
        ],
      },
    };
    const original = { ...detail, assignments: [assignment] };
    const view = render(
      <ResolveSubNeedDrawer
        assignment={assignment}
        detail={original}
        staff={staff}
        onClose={vi.fn()}
        onChange={vi.fn()}
      />,
    );
    const refreshed = {
      ...original,
      plan: { ...original.plan, structuredRevision: 2 },
    };
    const newCandidates = [
      { ...candidates[0], currentBurden: 3.75, projectedBurden: 4.75 },
    ];
    api.getCandidates.mockResolvedValueOnce(newCandidates);
    view.rerender(
      <ResolveSubNeedDrawer
        assignment={assignment}
        detail={refreshed}
        staff={staff}
        onClose={vi.fn()}
        onChange={vi.fn()}
      />,
    );
    await screen.findByText('3.75');
    await act(async () => {
      oldResponse(candidates);
      await Promise.resolve();
    });
    expect(screen.getByText('3.75')).toBeTruthy();
    expect(screen.queryByText('1.50')).toBeNull();
    expect(api.getCandidates).toHaveBeenCalledTimes(2);
  });

  it('retries failed interval candidates without losing either draft selection', async () => {
    await split();
    fireEvent.click(
      screen.getByRole('button', { name: 'Select Morgan Ellis' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Segment 2 ·/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Priya Nair' }));
    api.getCandidates.mockRejectedValue(
      new Error('Temporary interval failure'),
    );
    fireEvent.change(screen.getByLabelText('Segment 1 ends at'), {
      target: { value: '08:30' },
    });
    await screen.findByText('Temporary interval failure');
    expect(
      screen.getByRole('button', { name: /Segment 1 ·/ }).textContent,
    ).toContain('Morgan Ellis');
    expect(
      screen.getByRole('button', { name: /Segment 2 ·/ }).textContent,
    ).toContain('Priya Nair');
    api.getCandidates.mockResolvedValue(candidates);
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry interval candidates' }),
    );
    await screen.findByRole('button', { name: 'Select Priya Nair' });
    expect(
      screen
        .getByRole('button', { name: 'Select Priya Nair' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Segment 1 ·/ }));
    expect(
      screen
        .getByRole('button', { name: 'Select Morgan Ellis' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });
});
