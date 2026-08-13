INSERT INTO authorized_users (id, email, display_name, role, is_active)
VALUES ('user_local_admin', 'admin@sub-planning.test', 'Local Administrator', 'administrator', 1)
ON CONFLICT(id) DO UPDATE SET
  email = excluded.email,
  display_name = excluded.display_name,
  is_active = excluded.is_active;

INSERT INTO staff (id, display_name, role, is_active, can_sub, is_school_sub) VALUES
  ('staff_avery_bennett', 'Avery Bennett', 'teacher', 1, 1, 0),
  ('staff_jordan_kim', 'Jordan Kim', 'teacher', 1, 1, 0),
  ('staff_morgan_ellis', 'Morgan Ellis', 'teacher', 1, 1, 0),
  ('staff_priya_nair', 'Priya Nair', 'teacher', 1, 1, 0),
  ('staff_theo_wallace', 'Theo Wallace', 'teacher', 1, 1, 0),
  ('staff_casey_brooks', 'Casey Brooks', 'administrator', 1, 1, 0),
  ('staff_riley_quinn', 'Riley Quinn', 'substitute', 1, 1, 1)
ON CONFLICT(id) DO UPDATE SET
  display_name = excluded.display_name,
  role = excluded.role,
  is_active = excluded.is_active,
  can_sub = excluded.can_sub,
  is_school_sub = excluded.is_school_sub;

INSERT INTO rooms (id, name, is_active) VALUES
  ('room_pri_101', 'PRI-101', 1),
  ('room_el_204', 'EL-204', 1),
  ('room_int_301', 'INT-301', 1),
  ('room_ms_212', 'MS-212', 1),
  ('room_hs_lab', 'HS-LAB', 1),
  ('room_gym', 'GYM', 1)
ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_active = excluded.is_active;

INSERT INTO schedule_versions (
  id, name, effective_from, effective_to, status, source_file_name,
  source_file_sha256, created_by, activated_by, activated_at
) VALUES (
  'schedule_2026_fall', 'Fictional Fall Schedule', '2026-08-01', NULL, 'active',
  'fictional-fall-schedule.xlsx', 'seed-fixture-not-a-real-file-hash',
  'user_local_admin', 'user_local_admin', '2026-08-01T12:00:00.000Z'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  status = excluded.status,
  source_file_name = excluded.source_file_name,
  activated_by = excluded.activated_by,
  activated_at = excluded.activated_at;

INSERT INTO schedule_entries (
  id, schedule_version_id, staff_id, day_type, start_time, end_time,
  activity_type, category, description, room_id, requires_sub
) VALUES
  ('entry_avery_a_0800', 'schedule_2026_fall', 'staff_avery_bennett', 'A', '08:00', '08:50', 'instruction', 'PRI', 'Primary Literacy', 'room_pri_101', 1),
  ('entry_avery_a_0850', 'schedule_2026_fall', 'staff_avery_bennett', 'A', '08:50', '09:40', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
  ('entry_avery_a_0940', 'schedule_2026_fall', 'staff_avery_bennett', 'A', '09:40', '10:30', 'instruction', 'PRI', 'Primary Workshop', 'room_pri_101', 1),
  ('entry_avery_b_0800', 'schedule_2026_fall', 'staff_avery_bennett', 'B', '08:00', '08:50', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
  ('entry_avery_b_0850', 'schedule_2026_fall', 'staff_avery_bennett', 'B', '08:50', '09:40', 'instruction', 'PRI', 'Primary Literacy', 'room_pri_101', 1),
  ('entry_avery_all_1130', 'schedule_2026_fall', 'staff_avery_bennett', 'ALL', '11:30', '12:00', 'duty', 'LUNCH', 'Lunch Duty', 'room_gym', 1),

  ('entry_jordan_a_0800', 'schedule_2026_fall', 'staff_jordan_kim', 'A', '08:00', '08:50', 'instruction', 'EL', 'Elementary Mathematics', 'room_el_204', 1),
  ('entry_jordan_a_0850', 'schedule_2026_fall', 'staff_jordan_kim', 'A', '08:50', '09:40', 'instruction', 'EL', 'Elementary Mathematics', 'room_el_204', 1),
  ('entry_jordan_a_0940', 'schedule_2026_fall', 'staff_jordan_kim', 'A', '09:40', '10:30', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
  ('entry_jordan_b_0800', 'schedule_2026_fall', 'staff_jordan_kim', 'B', '08:00', '08:50', 'instruction', 'EL', 'Elementary Mathematics', 'room_el_204', 1),
  ('entry_jordan_b_0850', 'schedule_2026_fall', 'staff_jordan_kim', 'B', '08:50', '09:40', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
  ('entry_jordan_b_0940', 'schedule_2026_fall', 'staff_jordan_kim', 'B', '09:40', '10:30', 'instruction', 'EL', 'Elementary Mathematics', 'room_el_204', 1),

  ('entry_morgan_a_0800', 'schedule_2026_fall', 'staff_morgan_ellis', 'A', '08:00', '08:50', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
  ('entry_morgan_a_0850', 'schedule_2026_fall', 'staff_morgan_ellis', 'A', '08:50', '09:40', 'instruction', 'INT', 'Intermediate Science', 'room_int_301', 1),
  ('entry_morgan_b_0800', 'schedule_2026_fall', 'staff_morgan_ellis', 'B', '08:00', '08:50', 'instruction', 'INT', 'Intermediate Science', 'room_int_301', 1),
  ('entry_morgan_b_0850', 'schedule_2026_fall', 'staff_morgan_ellis', 'B', '08:50', '09:40', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
  ('entry_morgan_all_1500', 'schedule_2026_fall', 'staff_morgan_ellis', 'ALL', '15:00', '15:40', 'after_school', 'AFTER_SCHOOL_OTHER', 'Dismissal Responsibility', NULL, 1),

  ('entry_priya_a_0940', 'schedule_2026_fall', 'staff_priya_nair', 'A', '09:40', '10:30', 'instruction', 'MS', 'Middle School Humanities', 'room_ms_212', 1),
  ('entry_priya_a_1030', 'schedule_2026_fall', 'staff_priya_nair', 'A', '10:30', '11:20', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
  ('entry_priya_b_0940', 'schedule_2026_fall', 'staff_priya_nair', 'B', '09:40', '10:30', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
  ('entry_priya_b_1030', 'schedule_2026_fall', 'staff_priya_nair', 'B', '10:30', '11:20', 'instruction', 'MS', 'Middle School Humanities', 'room_ms_212', 1),

  ('entry_theo_a_1030', 'schedule_2026_fall', 'staff_theo_wallace', 'A', '10:30', '11:20', 'instruction', 'HS', 'High School Laboratory', 'room_hs_lab', 1),
  ('entry_theo_a_1120', 'schedule_2026_fall', 'staff_theo_wallace', 'A', '11:20', '12:10', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
  ('entry_theo_b_1030', 'schedule_2026_fall', 'staff_theo_wallace', 'B', '10:30', '11:20', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
  ('entry_theo_b_1120', 'schedule_2026_fall', 'staff_theo_wallace', 'B', '11:20', '12:10', 'instruction', 'HS', 'High School Laboratory', 'room_hs_lab', 1),

  ('entry_casey_all_0800', 'schedule_2026_fall', 'staff_casey_brooks', 'ALL', '08:00', '10:30', 'admin', 'PLAN_ADMIN', 'Admin', NULL, 0),
  ('entry_casey_all_1030', 'schedule_2026_fall', 'staff_casey_brooks', 'ALL', '10:30', '11:20', 'other', 'AFTER_SCHOOL_OTHER', 'Operations Meeting', NULL, 0),
  ('entry_school_sub_all', 'schedule_2026_fall', 'staff_riley_quinn', 'ALL', '08:00', '15:30', 'other', 'AFTER_SCHOOL_OTHER', 'School Sub Available', NULL, 0)
ON CONFLICT(id) DO UPDATE SET
  schedule_version_id = excluded.schedule_version_id,
  staff_id = excluded.staff_id,
  day_type = excluded.day_type,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  activity_type = excluded.activity_type,
  category = excluded.category,
  description = excluded.description,
  room_id = excluded.room_id,
  requires_sub = excluded.requires_sub;

INSERT INTO application_settings (
  id, school_name, school_logo_url, school_timezone, workload_warning_threshold,
  workload_window_days, split_snap_minutes, message_template, updated_by
) VALUES (
  'school', 'Fictional Academy', NULL, 'America/Chicago', 5.0, 7, 10,
  '{{school_name}} Sub Plan — {{date}} ({{day_type}} Day)\n\n{{assignments}}',
  'user_local_admin'
)
ON CONFLICT(id) DO UPDATE SET
  school_name = excluded.school_name,
  school_logo_url = excluded.school_logo_url,
  school_timezone = excluded.school_timezone,
  workload_warning_threshold = excluded.workload_warning_threshold,
  workload_window_days = excluded.workload_window_days,
  split_snap_minutes = excluded.split_snap_minutes,
  message_template = excluded.message_template,
  updated_by = excluded.updated_by;

INSERT INTO default_sub_plans (
  id, absent_staff_id, day_type, version, status, created_by, updated_by
) VALUES (
  'default_avery_shared', 'staff_avery_bennett', NULL, 1, 'active',
  'user_local_admin', 'user_local_admin'
)
ON CONFLICT(id) DO UPDATE SET
  absent_staff_id = excluded.absent_staff_id,
  day_type = excluded.day_type,
  version = excluded.version,
  status = excluded.status,
  updated_by = excluded.updated_by;

INSERT INTO default_sub_plan_actions (
  id, default_sub_plan_id, sequence, start_time, end_time, action_type,
  assigned_staff_id, room_id, details_json
) VALUES
  ('default_avery_0800', 'default_avery_shared', 0, '08:00', '08:50', 'teacher_covers', 'staff_morgan_ellis', NULL, NULL),
  ('default_avery_0850', 'default_avery_shared', 1, '08:50', '09:40', 'teacher_covers', 'staff_morgan_ellis', NULL, NULL),
  ('default_avery_lunch', 'default_avery_shared', 2, '11:30', '12:00', 'leave_uncovered', NULL, NULL, '{"label":"Lunch responsibility may be left uncovered"}')
ON CONFLICT(id) DO UPDATE SET
  default_sub_plan_id = excluded.default_sub_plan_id,
  sequence = excluded.sequence,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  action_type = excluded.action_type,
  assigned_staff_id = excluded.assigned_staff_id,
  room_id = excluded.room_id,
  details_json = excluded.details_json;
