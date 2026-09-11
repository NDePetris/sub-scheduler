// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getCalendarRange: vi.fn(),
  getScheduleManagement: vi.fn(),
  saveCalendarDate: vi.fn(),
  deleteCalendarDate: vi.fn(),
}));
vi.mock('../../src/lib/api', () => api);
import { CalendarAdministration } from '../../src/features/calendar/calendar-administration';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.values(api).forEach((mock) => mock.mockReset());
});

function renderCalendar() {
  api.getScheduleManagement.mockResolvedValue({ schoolDate: '2026-09-10' });
  api.getCalendarRange.mockResolvedValue({
    range: { startDate: '2026-08-30', endDate: '2026-10-03' },
    dates: [],
  });
  render(<CalendarAdministration />);
}

describe('CalendarAdministration', () => {
  it('uses the server-provided school date for Today and opens an unconfigured date', async () => {
    renderCalendar();
    await screen.findByRole('button', { name: /September 14.*unconfigured/i });
    fireEvent.click(
      screen.getByRole('button', { name: /September 14.*unconfigured/i }),
    );
    expect(
      screen.getByText(/Unconfigured — fallback behavior currently applies/),
    ).not.toBeNull();
    expect(screen.getByLabelText('School day')).not.toBeNull();
  });

  it('clears incompatible controls and saves normalized input', async () => {
    renderCalendar();
    const dateButton = await screen.findByRole('button', {
      name: /September 14.*unconfigured/i,
    });
    fireEvent.click(dateButton);
    fireEvent.click(screen.getByLabelText('School day'));
    expect(
      screen
        .getByRole('checkbox', { name: /Blackout day/ })
        .hasAttribute('disabled'),
    ).toBe(true);
    api.saveCalendarDate.mockResolvedValue(
      configured({ isSchoolDay: false, label: 'Closed' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    await waitFor(() =>
      expect(api.saveCalendarDate).toHaveBeenCalledWith(
        '2026-09-14',
        expect.objectContaining({
          isSchoolDay: false,
          expectedDayType: null,
          isBlackoutDay: false,
          expectsSpecialSchedule: false,
        }),
      ),
    );
  });

  it('removes only the selected explicit configuration after confirmation', async () => {
    api.getScheduleManagement.mockResolvedValue({ schoolDate: '2026-09-10' });
    api.getCalendarRange.mockResolvedValue({
      range: { startDate: '2026-08-30', endDate: '2026-10-03' },
      dates: [configured()],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CalendarAdministration />);
    const dateButton = await screen.findByRole('button', {
      name: /September 14/i,
    });
    fireEvent.click(dateButton);
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove configuration' }),
    );
    await waitFor(() =>
      expect(api.deleteCalendarDate).toHaveBeenCalledWith('2026-09-14'),
    );
  });
});

function configured(
  overrides: Partial<{ isSchoolDay: boolean; label: string | null }> = {},
) {
  return {
    date: '2026-09-14',
    expectedDayType: 'A' as const,
    isSchoolDay: true,
    isBlackoutDay: false,
    expectsSpecialSchedule: false,
    label: null,
    sourceType: 'manual_admin',
    updatedAt: '2026-09-10T12:00:00.000Z',
    updatedBy: 'Admin',
    specialSchedule: null,
    specialScheduleExpectedWarning: false,
    ...overrides,
  };
}
