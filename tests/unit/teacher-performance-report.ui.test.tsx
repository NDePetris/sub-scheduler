// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  TeacherPerformanceDetailReportData,
  TeacherPerformanceReportData,
} from '../../src/lib/api';

const api = vi.hoisted(() => ({
  getTeacherPerformanceDetailReport: vi.fn(),
  getTeacherPerformanceReport: vi.fn(),
}));

vi.mock('../../src/lib/api', () => api);

import { TeacherPerformanceReport } from '../../src/features/reports/teacher-performance-report';

afterEach(() => {
  cleanup();
  api.getTeacherPerformanceDetailReport.mockReset();
  api.getTeacherPerformanceReport.mockReset();
});

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function resolveDetail(
  request: Deferred<TeacherPerformanceDetailReportData>,
  response: TeacherPerformanceDetailReportData,
) {
  await act(async () => {
    request.resolve(response);
    await request.promise;
  });
}

function summary(
  startDate: string,
  endDate: string,
): TeacherPerformanceReportData {
  return {
    range: { startDate, endDate, today: endDate, includesFutureDates: false },
    calendar: { complete: true, missingWeekdayDates: 0 },
    teachers: [
      {
        staffId: 'teacher-a',
        displayName: 'Teacher A',
        isActive: true,
        absences: 0,
        blackoutDays: 0,
        partialAbsences: 0,
        coverageMinutes: 0,
      },
      {
        staffId: 'teacher-b',
        displayName: 'Teacher B',
        isActive: true,
        absences: 0,
        blackoutDays: 0,
        partialAbsences: 0,
        coverageMinutes: 0,
      },
    ],
  };
}

function detail(
  teacherId: string,
  displayName: string,
  marker: string,
): TeacherPerformanceDetailReportData {
  return {
    range: {
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      today: '2026-08-31',
      includesFutureDates: false,
    },
    calendar: { complete: true, missingWeekdayDates: 0 },
    teacher: {
      staffId: teacherId,
      displayName,
      isActive: true,
      standardPeriodMinutes: null,
      standardPeriodSource: 'unknown',
    },
    absenceSummary: {
      absences: 0,
      regularFullDayAbsences: 0,
      blackoutDays: 0,
      partialAbsences: 0,
      partialAbsenceMinutes: 0,
    },
    coverageSummary: {
      coverageMinutes: 30,
      coverageSegments: 1,
      coveragePeriodEquivalents: 1,
      planPeriodsLost: 0,
    },
    absenceDetails: { fullDayAbsences: [], partialAbsences: [] },
    coverageDetails: [
      {
        date: '2026-08-10',
        coverageMinutes: 30,
        coverageSegments: 1,
        coveragePeriodEquivalents: 1,
        planPeriodsLost: 0,
        standardPeriodMinutes: null,
        standardPeriodSource: 'unknown',
        entries: [
          {
            assignmentId: marker,
            segmentId: null,
            startTime: '08:00',
            endTime: '08:30',
            minutes: 30,
            responsibilityType: 'instruction',
            description: marker,
            absentStaffId: 'absent-teacher',
            absentStaffName: 'Absent Teacher',
            resolutionType: 'teacher_cover',
          },
        ],
      },
    ],
  };
}

async function renderReport() {
  api.getTeacherPerformanceReport.mockImplementation(
    (startDate: string, endDate: string) =>
      Promise.resolve(summary(startDate, endDate)),
  );
  render(<TeacherPerformanceReport />);
  await screen.findByRole('button', { name: 'Teacher A' });
}

describe('TeacherPerformanceReport detail drawer', () => {
  it('does not render Teacher A detail beneath Teacher B while B detail is pending', async () => {
    const a = deferred<TeacherPerformanceDetailReportData>();
    const b = deferred<TeacherPerformanceDetailReportData>();
    api.getTeacherPerformanceDetailReport.mockReturnValueOnce(a.promise);
    api.getTeacherPerformanceDetailReport.mockReturnValueOnce(b.promise);
    await renderReport();

    fireEvent.click(screen.getByRole('button', { name: 'Teacher A' }));
    await waitFor(() =>
      expect(api.getTeacherPerformanceDetailReport).toHaveBeenCalledTimes(1),
    );
    await resolveDetail(
      a,
      detail('teacher-a', 'Teacher A', 'Teacher A marker'),
    );
    await screen.findByText(/Teacher A marker/);

    fireEvent.click(screen.getByRole('button', { name: 'Teacher B' }));

    expect(screen.getByRole('heading', { name: 'Teacher B' })).not.toBeNull();
    expect(screen.queryByText(/Teacher A marker/)).toBeNull();
    expect(screen.getByText('Loading Teacher details…')).not.toBeNull();

    await waitFor(() =>
      expect(api.getTeacherPerformanceDetailReport).toHaveBeenCalledTimes(2),
    );
    await resolveDetail(
      b,
      detail('teacher-b', 'Teacher B', 'Teacher B marker'),
    );
    await screen.findByText(/Teacher B marker/);
  });

  it('does not render the prior range detail while replacement detail is pending', async () => {
    const original = deferred<TeacherPerformanceDetailReportData>();
    const replacement = deferred<TeacherPerformanceDetailReportData>();
    api.getTeacherPerformanceDetailReport.mockReturnValueOnce(original.promise);
    api.getTeacherPerformanceDetailReport.mockReturnValueOnce(
      replacement.promise,
    );
    await renderReport();

    fireEvent.click(screen.getByRole('button', { name: 'Teacher A' }));
    await waitFor(() =>
      expect(api.getTeacherPerformanceDetailReport).toHaveBeenCalledTimes(1),
    );
    await resolveDetail(
      original,
      detail('teacher-a', 'Teacher A', 'Original range marker'),
    );
    await screen.findByText(/Original range marker/);

    fireEvent.change(screen.getByLabelText('From date'), {
      target: { value: '2026-08-02' },
    });

    expect(screen.getByRole('dialog').textContent).toContain('Aug 2, 2026');
    expect(screen.queryByText(/Original range marker/)).toBeNull();
    expect(screen.getByText('Loading Teacher details…')).not.toBeNull();

    await waitFor(() =>
      expect(api.getTeacherPerformanceDetailReport).toHaveBeenCalledTimes(2),
    );
    await resolveDetail(
      replacement,
      detail('teacher-a', 'Teacher A', 'Replacement range marker'),
    );
    await screen.findByText(/Replacement range marker/);
  });

  it('ignores a stale completion after newer detail has rendered', async () => {
    const a = deferred<TeacherPerformanceDetailReportData>();
    const b = deferred<TeacherPerformanceDetailReportData>();
    api.getTeacherPerformanceDetailReport.mockReturnValueOnce(a.promise);
    api.getTeacherPerformanceDetailReport.mockReturnValueOnce(b.promise);
    await renderReport();

    fireEvent.click(screen.getByRole('button', { name: 'Teacher A' }));
    await waitFor(() =>
      expect(api.getTeacherPerformanceDetailReport).toHaveBeenCalledTimes(1),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Teacher B' }));
    await waitFor(() =>
      expect(api.getTeacherPerformanceDetailReport).toHaveBeenCalledTimes(2),
    );
    await resolveDetail(
      b,
      detail('teacher-b', 'Teacher B', 'Teacher B marker'),
    );
    await screen.findByText(/Teacher B marker/);

    await resolveDetail(
      a,
      detail('teacher-a', 'Teacher A', 'Teacher A late marker'),
    );
    await waitFor(() =>
      expect(screen.getByText(/Teacher B marker/)).not.toBeNull(),
    );
    expect(screen.queryByText(/Teacher A late marker/)).toBeNull();
  });
});
