import {
  CalendarClock,
  ClipboardList,
  FileSpreadsheet,
  Settings,
  SlidersHorizontal,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

export interface NavigationItem {
  readonly label: string;
  readonly path: string;
  readonly icon: LucideIcon;
  readonly description: string;
}

export const navigationItems: readonly NavigationItem[] = [
  {
    label: 'Sub Plan',
    path: '/',
    icon: ClipboardList,
    description: 'Daily planning workspace',
  },
  {
    label: 'Absences',
    path: '/absences',
    icon: CalendarClock,
    description: 'Recorded staff absences',
  },
  {
    label: 'Schedule',
    path: '/schedule',
    icon: FileSpreadsheet,
    description: 'Schedules and imports',
  },
  {
    label: 'Staff & Rooms',
    path: '/staff-rooms',
    icon: UsersRound,
    description: 'Persistent staff and room records',
  },
  {
    label: 'Default Sub Plans',
    path: '/default-sub-plans',
    icon: SlidersHorizontal,
    description: 'Structured school preferences',
  },
  {
    label: 'Settings',
    path: '/settings',
    icon: Settings,
    description: 'School configuration',
  },
];

export function navigationItemForPath(path: string): NavigationItem {
  return (
    navigationItems.find((item) => item.path === path) ?? navigationItems[0]!
  );
}
