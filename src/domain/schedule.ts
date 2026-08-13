export const scheduleDayTypes = ['A', 'B', 'ALL'] as const;
export type ScheduleDayType = (typeof scheduleDayTypes)[number];
export type PlanDayType = Exclude<ScheduleDayType, 'ALL'>;

export function appliesToDay(
  scheduleDayType: ScheduleDayType,
  planDayType: PlanDayType,
): boolean {
  return scheduleDayType === 'ALL' || scheduleDayType === planDayType;
}
