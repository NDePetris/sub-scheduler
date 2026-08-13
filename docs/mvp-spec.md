# School Sub Planning Web App
## Minimum Viable Product Specification

**Status:** Ready for implementation planning  
**Primary users:** School administrators  
**Primary device:** Laptop  
**Application type:** Internal web application  
**Authentication:** School Google Workspace accounts  
**Visual identity:** Apple Green (`#7EA243`), white, and neutral grays

---

## 1. Product Purpose

The School Sub Planning application will give administrators at a small K–12 private school a fast, centralized way to create and manage daily substitute plans when teachers are absent.

The application will combine:

- the school's current teacher schedule;
- a structured Default Sub Plan;
- administrator-entered teacher absences;
- staff availability;
- recent subbing workload;

to create a draft Sub Plan for a particular date.

The administrator can then review, modify, override, split, or redistribute assignments before generating an editable text summary to send to affected staff.

The application is a **decision-support tool**, not an autonomous scheduling system. School administrators retain the ability to override any recommendation.

---

## 2. MVP Goals

The MVP must make the common workflow substantially faster than manually comparing schedules and consulting a Default Sub Plan.

An administrator should be able to:

1. Open a date.
2. Confirm whether it is an A or B day.
3. Enter one or more teacher absences.
4. Have the application identify affected classes and responsibilities.
5. Apply the relevant Default Sub Plan automatically wherever possible.
6. Immediately see unresolved conflicts.
7. Select alternate subs based on real-time availability and recent subbing workload.
8. Handle class redistribution and unusual split coverage when necessary.
9. Review the completed daily Sub Plan.
10. Generate, edit, regenerate, and copy a text version of the plan.

The interface should allow an administrator to see **most or all of the day's affected assignments on a typical laptop screen without excessive scrolling**.

---

## 3. Non-Goals for MVP

The following are explicitly deferred:

- teacher-facing absence submission;
- teacher upload of lesson/sub plans;
- after-school activity plan submission;
- automatic email sending;
- Google Calendar synchronization;
- student-level information or rosters;
- student names;
- automatic optimization of the entire school day;
- AI-generated scheduling decisions;
- sophisticated room-capacity enforcement;
- automatic interpretation of arbitrary Default Sub Plan Word documents on an ongoing basis;
- detailed reporting dashboards;
- mobile-first design.

The data model should not make these features unnecessarily difficult to add later.

---

## 4. Users and Access

### 4.1 Administrator

The only MVP user role is **Administrator**.

Administrators may:

- view schedules;
- enter and edit absences;
- create plans for past, current, and future dates;
- assign subs;
- override Default Sub Plans;
- redistribute classes;
- split assignments;
- leave eligible non-class responsibilities uncovered;
- upload schedules;
- activate schedule versions;
- edit structured Default Sub Plans;
- generate Sub Plan communication;
- finalize and reopen plans.

### 4.2 Authentication

The app will be accessible only to authorized users.

The intended access model is based on approved Google Workspace accounts, while also allowing a small number of explicitly approved non-Workspace accounts if needed.

Authentication and authorization should be implemented in a way that supports a simple allowlist of permitted users and does not require the application to manage passwords directly.

---

## 5. Core Terminology

Use the following terminology consistently in the UI:

- **Sub Plan** — the plan for a particular school day.
- **Default Sub Plan** — the school's predefined preferred response when a particular teacher is absent.
- **Needs Sub** — a class or responsibility that requires attention because the assigned teacher is absent.
- **Assignment** — one individual coverage requirement created by an absence.
- **Assigned** — an Assignment that has been resolved.
- **Unresolved** — an Assignment that still needs administrator attention.
- **School Sub** — the school's dedicated substitute teacher.
- **Plan Periods Lost** — normalized measure of teacher plan time used for subbing.

Avoid using "Coverage Plan" as the primary UI terminology.

---

## 6. School Schedule Model

### 6.1 Source

The school maintains a spreadsheet containing:

- teachers;
- teacher schedules;
- room identifiers;
- A/B schedule differences;
- PLAN periods;
- Admin periods;
- classes;
- duties;
- lunch;
- after-school responsibilities;
- other scheduled activities.

The spreadsheet structure is expected to remain stable even though the underlying schedule changes frequently.

The application will therefore implement a **school-specific schedule importer**, rather than a universal spreadsheet importer.

### 6.2 Time Model

Time is the fundamental scheduling unit.

Do **not** model assignments solely as numbered periods.

Every scheduled block has:

- start time;
- end time;
- teacher;
- schedule type;
- description;
- room, when applicable;
- A/B applicability.

This permits normal 40- and 50-minute periods as well as unusual assignments that must be divided into smaller segments.

### 6.3 A/B Schedules

If a teacher has explicitly separate A and B schedule columns, those schedules are distinct.

If a teacher has only one schedule column, that schedule applies identically to both A and B days.

Each Daily Sub Plan has an A/B designation.

The administrator must be able to:

- view the currently selected A/B day;
- manually switch A ↔ B;
- override the expected designation for a specific date.

### 6.4 Effective-Dated Schedules

Each normal schedule version has:

- **Effective From**
- **Effective To**, optional

If **Effective To** is blank, that schedule remains active until a newer normal schedule becomes effective.

When a new normal schedule is activated, the prior open-ended schedule should be treated as ending immediately before the new schedule's Effective From date.

This allows schedule history to remain intact while future dates automatically use the correct schedule.

---

## 7. Schedule Categories and Full-Schedule Colors

The Full Schedule / Timeline view will visually categorize schedule blocks by school level or activity type.

Required categories:

- **PRI** — Primary
- **EL** — Elementary
- **INT** — Intermediate
- **MS** — Middle School
- **HS** — High School
- **PLAN / ADMIN**
- **LUNCH**
- **AFTER SCHOOL / OTHER**

Each category receives a distinct, subdued background color.

Colors must be used as a secondary visual aid. Every block must also contain a text label so the schedule remains understandable without relying on color alone.

Apple Green should remain the application's primary action/brand color rather than being assigned to one instructional group.

---

## 8. Schedule Versioning, Import, and Special Schedules

Because schedules change frequently, schedule refreshes are a normal workflow rather than a one-time setup action.

### 8.1 Normal Schedule Upload

An administrator can upload the school's schedule spreadsheet.

MVP file format:

- `.xlsx`

Each uploaded normal schedule has:

- Effective From date;
- optional Effective To date.

If Effective To is not supplied, the schedule remains active until superseded by a newer normal schedule.

### 8.2 Import Validation

Before activating an uploaded schedule, show a validation screen containing results such as:

- staff recognized;
- rooms recognized;
- A/B structures recognized;
- new teacher names requiring mapping;
- cells that could not be interpreted;
- schedule conflicts or malformed ranges;
- references from Default Sub Plans that no longer match staff records.

Example:

**Schedule validation**

- ✓ 34 staff recognized
- ✓ 28 rooms recognized
- ✓ A/B schedule detected
- ⚠ 1 new staff member requires mapping
- ⚠ 2 schedule blocks could not be interpreted

The administrator must review validation before activating the version.

### 8.3 Staff Identity Mapping

Display names from spreadsheets must map to persistent staff records.

Names should not themselves be used as database identifiers.

If a name changes slightly between schedule uploads, administrators must be able to map the imported value to the existing staff member.

### 8.4 Activation

A validated import becomes a new **Schedule Version**.

The applicable normal schedule for a date is determined by its Effective From and Effective To dates.

Historical Daily Sub Plans remain associated with the schedule version they were created from.

Before activation closes a prior open-ended Schedule Version, the administrator must see and confirm the exact proposed prior Effective To date. The prior range adjustment and new-version activation occur atomically. Finite or otherwise ambiguous overlaps remain blocking conflicts and identify the conflicting Schedule Version.

Activated Schedule Version names and effective dates may be corrected after activation, subject to the same non-overlap validation. Corrections affect schedule resolution for future or uncreated Daily Sub Plans only; existing plans retain their pinned schedule references.

An activated Schedule Version with no Daily Sub Plan references may be deleted with its entries and related import metadata. A referenced version must be archived instead so it no longer participates in normal resolution while its historical entries and pinned plans remain intact. Staff and Rooms are never deleted merely because they appeared in an import.

### 8.5 Special One-Day Schedules

An administrator may designate a **Special Schedule** for a particular calendar date.

A Special Schedule:

- applies only to that one date;
- overrides the otherwise applicable effective-dated normal schedule for that date;
- does not change the Effective From or Effective To dates of the normal schedule;
- does not become the new default schedule.

Example:

- Sept. 15 → normal effective-dated schedule
- Sept. 16 → special assembly schedule
- Sept. 17 → normal effective-dated schedule resumes automatically

Historical Daily Sub Plans should retain the special schedule used for that date.

---

## 9. Rooms

Room identifiers are stored as **text**, not numbers.

The MVP stores room assignments from the schedule and permits a room to be changed as part of a Sub Plan action.

Room capacity validation is not required.

No student-count field is required anywhere in the application.

---

## 10. Staff Model

Each staff record contains at minimum:

- stable internal ID;
- display name;
- role;
- active/inactive status;
- whether the person may sub;
- whether the person should appear as the **School Sub**.

### Default Role

The default staff role is:

**Teacher**

Administrators or other staff types can be explicitly configured as needed.

### School Sub

Use a dedicated flag such as:

`is_school_sub`

to identify staff members who should appear as the School Sub in the planning interface.

The School Sub should remain a normal staff record rather than being implemented as a hard-coded system user.

---

## 11. Availability

A staff member is automatically considered available to sub when their schedule contains:

- **PLAN**, or
- **Admin**

during the relevant time.

Other blocks do not automatically indicate availability.

Examples of blocks that do not automatically create availability:

- lunch;
- duties;
- classes;
- student support;
- meetings;
- advisory;
- after-school activities;
- other scheduled responsibilities.

Administrators retain the ability to override the availability logic.

---

## 12. Absence Entry

The MVP absence flow should be intentionally minimal.

### 12.1 Add Absence Screen

Display:

#### Absent Teacher
A searchable dropdown of active teachers.

#### When will they be absent?

Three radio-button options:

**Specific date**

When selected, show:

- Date

This represents an all-day absence for that date.

**Date range**

When selected, show:

- Start date
- End date

This represents an all-day absence on each applicable date in the range.

**Time range on a specific date**

When selected, show:

- Date
- Start time
- End time

This represents a partial-day absence.

Only the fields associated with the selected radio option should be visible.

### 12.2 Deferred Absence Data

Do not include in MVP:

- absence reason/type;
- notes;
- uploaded lesson plans;
- after-school instructions;
- attachments.

These can be added to the absence entity later without redesigning the basic workflow.

If a saved absence has no applicable scheduled responsibility requiring a Sub for a Daily Sub Plan, persist the absence and show an informational explanation. This is not a fatal validation error and must be distinguished from an Assignment list whose active filters merely hide existing Assignments.

---

## 13. Daily Sub Plan

A **Daily Sub Plan** exists for a specific date.

It stores:

- date;
- A/B designation;
- schedule version;
- special-schedule reference when applicable;
- absences;
- generated Assignments;
- administrator modifications;
- status;
- generated message;
- last-modified information.

### 13.1 Date Navigation

The primary screen must allow administrators to move easily through dates.

Required controls:

- Previous Day
- displayed date
- date picker
- Next Day
- Today

Administrators can therefore:

- review previous plans;
- work on today's plan;
- prepare a future plan;
- plan several days ahead for known absences.

---

## 14. Assignment Generation

When an absence is entered, the system compares the absence time with the selected day's schedule.

For each affected scheduled responsibility, the application determines whether a Sub Assignment should be created.

Potential affected responsibilities include:

- classes;
- lunch duty;
- other duties;
- after-school responsibilities;
- other configured responsibilities.

Instructional classes normally require resolution.

Non-class responsibilities may be intentionally left without a sub.

---

## 15. Default Sub Plans

### 15.1 Purpose

A Default Sub Plan represents the school's preferred response when a specific teacher is absent.

Its purpose is to **soft-populate** the daily plan.

It is not a hard rule.

All generated actions may be modified by an administrator.

### 15.2 Structured Representation

The runtime system should store Default Sub Plans as structured data rather than repeatedly interpreting Word prose.

The school's production Default Sub Plan document will be used to seed this structured configuration.

Ongoing arbitrary `.docx` interpretation is not required in MVP.

Administrators should later be able to edit structured Default Sub Plans through an application screen.

### 15.3 Supported Default Actions

A Default Sub Plan may contain actions such as:

#### Teacher Covers
A staff member takes responsibility for another teacher's class or duty.

#### Redistribute Class
The absent teacher's class is conceptually distributed among two or more other teachers.

The application does not track students or individual groups.

Example:

- ½ group → EL Math Teacher
- ½ group → EL Writing Teacher

#### Switch Groups
Previously redistributed groups change teachers.

#### Combine Class
A class is combined with another group.

#### Move Room
The activity moves to another room.

#### Cover Duty
A staff member covers lunch, after-school, or another non-class responsibility.

#### Leave Uncovered
A non-class responsibility is intentionally left without a substitute.

#### Manual / Unresolved
The Default Sub Plan does not fully resolve the need and administrator input is required.

### 15.4 Defaults and Conflicts

When a Default Sub Plan assignment is valid, populate it automatically and label it:

**Default**

If a default cannot be used—for example because that teacher is also absent or already assigned elsewhere—the app must:

- preserve the Default Sub Plan information;
- mark the Assignment unresolved;
- explain the conflict;
- show alternative candidates.

Do not silently replace a default assignment.

---

## 16. Main Daily Sub Plan Screen

The Daily Sub Plan screen is the primary workspace.

It is optimized for laptop use and should fit most of a normal day's affected Assignments without excessive scrolling.

### 16.1 Header

Display:

- **Sub Plan**
- Previous Day
- date
- Next Day
- calendar picker
- Today
- current A/B day
- A/B override
- Add Absence

### 16.2 Summary Boxes

Display:

#### Teachers Absent
Number of teachers absent on that date.

#### Assignments
Number of affected responsibilities generated.

#### Assigned
Number currently resolved.

#### Unresolved
Number requiring attention.

#### Workload Warning
Number of staff at or above the configured recent-sub threshold.

### 16.3 Main View Tabs

#### Affected Only
Default view.

Displays only responsibilities affected by absences.

#### Full Schedule
Displays the complete school schedule/timeline.

### 16.4 Filters

Affected Only should provide compact filters such as:

- All Needs
- Classes
- Duties
- Unresolved
- Staff
- Search

### 16.5 Table Columns

The primary table contains only:

- **Time**
- **Absent Teacher**
- **Type**
- **Class / Responsibility**
- **Assigned**
- **Status**

Do not include:

- Students
- Default Sub Plan
- student/group counts
- unexplained metadata icons

### 16.6 Default Indicator

If an Assignment currently matches its Default Sub Plan, display a small:

**Default**

badge beside the Assigned value.

The full underlying default is visible only when the Assignment is opened.

---

## 17. Assignment Status

Required statuses include:

### Assigned
Assignment has been resolved.

### Unresolved
Administrator action is required.

### Workload Warning
Assignment is valid, but the selected teacher has reached or is approaching the configured workload threshold.

### Intentionally Uncovered
Applicable primarily to non-class responsibilities.

Warnings must not prevent administrator overrides.

---

## 18. Resolve Sub Need Drawer

Clicking an Assignment opens a right-side **Resolve Sub Need** drawer without navigating away from the Daily Sub Plan.

### 18.1 Assignment Context

Show:

- date;
- A/B day;
- start/end time;
- absent teacher;
- type;
- class/responsibility;
- current assignment/status;
- room when relevant.

### 18.2 Default Sub Plan

Display the preferred default action separately.

Example:

**Default Sub Plan**  
EL Math Teacher covers

**Default**

If that option is unavailable, explain why.

### 18.3 Recommended Candidates

Available candidates are displayed in a compact table/list.

For each candidate show:

- staff name;
- availability status;
- availability source:
  - Plan Period
  - Admin
  - School Sub
- Plan Periods Lost Today;
- Plan Periods Lost in rolling 7-day window;
- fairness/workload warning;
- Assign button.

### 18.4 Candidate Ordering

Recommended ordering:

1. valid Default Sub Plan assignment;
2. available School Sub;
3. staff available during PLAN periods;
4. staff available during Admin periods;
5. other manually selectable staff.

Within comparable groups, favor people with lower recent subbing burden.

Availability and workload should influence ranking but never constitute a hard prohibition.

### 18.5 Other Options

Depending on Assignment type, provide:

- Split Assignment
- Redistribute Class
- Combine Class
- Move Room
- Leave Uncovered
- Assign Anyway / Override

`Leave Uncovered` should be presented normally for non-class responsibilities.

For instructional classes, leaving an Assignment unresolved or uncovered should require an explicit override/warning.

---

## 19. Subbing Workload / Fairness

Administrators want to prioritize teachers who have not recently sacrificed as much plan time.

This information must be prominent whenever an alternate sub is selected.

### 19.1 Measurement

Use **Plan Period Equivalents**, not number of Assignments.

For every teacher PLAN block affected by subbing:

`plan-period equivalent = overlapping coverage minutes / normal duration of that PLAN block`

Calculate separately for every affected PLAN block and sum the result.

#### Example

A teacher has 40-minute plan periods.

They sub:

- all 40 minutes of one plan period;
- 10 minutes of another 40-minute plan period.

Burden:

- `40 / 40 = 1.00`
- `10 / 40 = 0.25`

Total:

**1.25 Plan Periods Lost**

### 19.2 Admin Blocks

Admin blocks make a person **available** for subbing.

They do not automatically count as teacher Plan Periods Lost.

The fairness metric is based on scheduled PLAN time sacrificed.

### 19.3 Rolling Warning

Default threshold:

**5.0 Plan Periods Lost within the previous 7 calendar days**

The threshold and rolling-window length should be stored as configurable settings rather than hard-coded.

### 19.4 Proposed Assignments

When displaying a potential candidate, calculate the effect of the proposed Assignment.

Example:

**Current rolling burden:** 4.50  
**Proposed Assignment:** +0.75  
**Projected:** 5.25

Display:

**⚠ 5.25 / 7 days**

before the administrator makes the assignment.

### 19.5 Higher-Level Warning

The Daily Sub Plan must flag when assigned staff are at or above the workload threshold.

This warning should be noticeable but not treated as an error.

---

## 20. Split Assignments and Partial Coverage

Although uncommon, the app must support cases in which multiple people cover different parts of one class.

Example:

- Teacher A: 9:00–9:40
- Teacher B: 9:40–9:50

A subsequent class might then be:

- Teacher B: 9:50–10:20
- Teacher C: 10:20–10:40

### 20.1 UI

The standard interface should treat a class as one block.

Selecting **Split Assignment** opens a more detailed editor.

Split times should snap to **10-minute increments by default**.

### 20.2 Storage

Do not store split coverage as artificial numbered periods.

Store each segment using:

- start time;
- end time;
- assigned staff member;
- parent Assignment.

This allows arbitrary combinations without changing the underlying model.

---

## 21. Full Schedule / Timeline View

The Full Schedule should retain the basic readability of the school's existing spreadsheet while fitting the visual system of the app.

### 21.1 Layout

Preferred MVP layout:

**Rows:** teachers  
**Columns:** time  
**Blocks:** scheduled activities

This orientation is better suited to:

- laptop displays;
- timeline reasoning;
- split assignments;
- comparisons across teachers;
- the rest of the application's UI.

### 21.2 Schedule Blocks

Every block shows enough text to understand the activity.

Where appropriate:

- activity/class;
- room.

Use the category colors specified in Section 7.

### 21.3 Absences and Subbing

The Timeline should visually indicate:

- absent time;
- existing class;
- PLAN;
- Admin;
- sub assignment;
- duty;
- intentionally uncovered responsibility.

### 21.4 Purpose

The Timeline is secondary to Affected Only.

Use it primarily when an administrator needs to:

- investigate complex availability;
- see the entire school;
- resolve unusual 40-/50-minute overlaps;
- build split coverage;
- understand interactions among multiple absences.

---

## 22. School Sub

The dedicated School Sub is represented as a normal staff member with the `is_school_sub` flag enabled.

The School Sub:

- appears prominently in candidate lists;
- can be assigned like another staff member;
- is treated as available according to configured availability;
- does not accumulate teacher Plan Periods Lost.

The School Sub should not be implemented as hard-coded application logic.

---

## 23. Non-Class Responsibilities

Activities such as:

- lunch duty;
- after-school duty;
- other defined responsibilities;

may generate Needs Sub Assignments.

Unlike instructional classes, the administrator can choose:

**Leave Uncovered**

This is a deliberate resolution and should not continue to display as an unresolved error.

---

## 24. Administrator Overrides

Administrators must be able to override application recommendations.

The application may warn about:

- schedule conflicts;
- workload thresholds;
- absent staff;
- partial availability;
- Default Sub Plan deviations.

Warnings are advisory.

When a clearly conflicting assignment is made, require an explicit acknowledgement such as:

**Assign Anyway**

rather than preventing the action.

---

## 25. Generated Sub Plan Message

Once the plan is ready, the administrator can open **Review & Finalize**.

### 25.1 Generated Output

Generate one copyable text message representing the day's Sub Plan.

Content is based on a configurable text template and the structured daily plan.

It may contain:

- date;
- A/B day;
- absent teachers;
- assignments;
- class redistributions;
- duties;
- unusual notes generated from assignments.

### 25.2 Editing

The generated message must be directly editable.

Required controls:

- **Regenerate**
- **Copy to Clipboard**

Regenerate recreates the message from current structured plan data.

Editing the generated text does not modify the underlying Sub Assignments.

### 25.3 MVP Delivery

The app does **not** send email itself.

The administrator copies the finished message and uses the school's existing communication system.

---

## 26. Plan State and History

Daily plans have at least:

- Draft
- Finalized

Finalization is not permanent.

An administrator may reopen a finalized plan and change it.

Store basic audit metadata:

- created by;
- created timestamp;
- last modified by;
- last modified timestamp;
- finalized timestamp.

Historical plans must continue to display the schedule and assignments that applied at the time.

---

## 27. Default Sub Plan Administration

A Settings area should provide a structured Default Sub Plan editor.

Administrators can choose an absent teacher and define ordered actions such as:

| Time | Action |
|---|---|
| 8:00–8:50 | Redistribute group between Teacher A and Teacher B |
| 8:50–9:50 | Switch groups |
| 9:50–10:40 | Teacher A covers |
| 11:20–12:00 | Lunch responsibility needs sub |
| 1:30–2:30 | Teacher B covers |

Production Default Sub Plans should use real staff records rather than free-text teacher names wherever possible.

The currently supplied Default Sub Plan document is a **draft source document**, not final production data.

---

## 28. Application Navigation

Recommended initial MVP navigation:

- **Sub Plan**
- **Absences**
- **Schedule**
- **Staff & Rooms**
- **Default Sub Plans**
- **Settings**

Potential future navigation:

- Calendar
- Reports

The navigation structure should **not be tightly coupled to application functionality**. Sections may be combined, renamed, or reorganized in future iterations without requiring major changes to the underlying feature structure.

For example, future versions may consolidate:

- Schedule + Staff & Rooms;
- Default Sub Plans + Settings;
- Calendar + Sub Plan;

if administrator usage suggests a simpler navigation model.

Avoid adding empty sections solely because they appeared in visual mockups.

---

## 29. Visual Design

### 29.1 Brand

Primary color:

**Apple Green — `#7EA243`**

Use primarily for:

- primary buttons;
- selected navigation;
- active tabs;
- success indicators;
- important highlights.

Do not flood large portions of the UI with green.

### 29.2 School Logo

The application must support a **configurable school logo**.

The configured logo appears in the **upper-left area of the application navigation/header**, consistent with the approved mockups.

Logo configuration should be managed through Settings rather than hard-coded into the application.

If no logo is configured, the interface should fall back gracefully to the configured school name or a neutral application mark.

### 29.3 Supporting Colors

Use:

- white backgrounds;
- light neutral gray containers;
- dark charcoal text;
- amber for workload warnings;
- red for actual conflicts/errors.

### 29.4 Density

The interface should be:

- compact;
- readable;
- optimized for frequent administrative use;
- information-dense without feeling like a raw spreadsheet.

Avoid oversized cards and excessive whitespace.

### 29.5 Accessibility

Status must never be represented by color alone.

Use:

- icons;
- text labels;
- badges;
- color.

---

## 30. Technical Architecture

### 30.1 Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui or equivalent accessible component library

### 30.2 Application/API

- Cloudflare Workers

### 30.3 Database

- Cloudflare D1

### 30.4 Authentication

- Cloudflare Access and/or application-level authentication compatible with the school's Google Workspace accounts plus a small allowlist of approved external accounts.

### 30.5 Hosting

Cloudflare will host the application and provide the initial platform for potential future internal school applications.

The application should be independently deployable while allowing future school tools to use the same general authentication and infrastructure pattern.

---

## 31. Core Data Entities

The exact SQL schema may change during implementation, but the logical model should include:

### Staff

- id
- name
- role — defaults to `teacher`
- active
- can_sub
- is_school_sub

### Rooms

- id
- name

### ScheduleVersions

Represents a normal effective-dated school schedule.

- id
- effective_from
- effective_to nullable
- source_file
- created_at
- created_by

If `effective_to` is null, the schedule remains in effect until superseded by a newer normal Schedule Version.

### ScheduleEntries

- id
- schedule_version_id
- staff_id
- day_type
- start_time
- end_time
- activity_type
- category
- description
- room_id

### SpecialSchedules

Represents a one-day override to the normal effective-dated schedule.

- id
- date
- source_file or schedule reference
- created_at
- created_by

A Special Schedule applies **only to its specified date**.

It does not alter the Effective From / Effective To dates of any normal Schedule Version.

### SpecialScheduleEntries

- id
- special_schedule_id
- staff_id
- day_type or applicable day designation
- start_time
- end_time
- activity_type
- category
- description
- room_id

### Absences

- id
- staff_id
- start_date
- end_date
- start_time nullable
- end_time nullable
- created_by
- created_at

### DailySubPlans

- id
- date
- day_type
- schedule_version_id
- special_schedule_id nullable
- status
- created_by
- created_at
- updated_at
- finalized_at

If `special_schedule_id` is populated, that schedule takes precedence for that Daily Sub Plan.

Otherwise, the appropriate effective-dated `schedule_version_id` is used.

The Daily Sub Plan should retain the exact schedule reference used when the plan was created so historical plans do not change if schedule effective dates are later edited.

### DefaultSubPlans

- id
- absent_staff_id
- day_type nullable
- version/status

### DefaultSubPlanActions

- id
- default_sub_plan_id
- sequence
- start_time
- end_time
- action_type
- assigned_staff_id nullable
- room_id nullable
- structured details

### Assignments

- id
- daily_sub_plan_id
- absence_id
- start_time
- end_time
- responsibility_type
- description
- default_action_id nullable
- resolution_type
- status

### AssignmentSegments

Used when a single Assignment has split coverage.

- id
- assignment_id
- start_time
- end_time
- staff_id

### GeneratedMessages

- id
- daily_sub_plan_id
- generated_text
- edited_text
- generated_at

### ApplicationSettings

Supports school-level configuration without hard-coding branding or configurable policies.

Initial settings should support at least:

- school name;
- school logo;
- workload warning threshold;
- workload rolling-window length.

Additional school-level settings may be added later.

---

## 32. Derived Calculations

Do not persist values unnecessarily when they can safely be calculated.

Derived values include:

- available staff at a time;
- overlapping schedule entries;
- plan-period-equivalent burden;
- rolling 7-day burden;
- projected workload after proposed assignment;
- number of Assignments;
- number Assigned;
- number Unresolved;
- workload-warning counts.

---

## 33. Data Privacy

The MVP must contain **no student-level information**.

Do not store:

- student names;
- student IDs;
- rosters;
- attendance records;
- grades;
- personally identifiable student information.

Class redistribution is represented conceptually.

---

## 34. MVP Primary Workflow

A successful normal workflow is:

1. Administrator signs in.
2. Application opens the Daily Sub Plan.
3. Administrator selects today's or a future date.
4. Administrator confirms A/B designation.
5. Administrator clicks **Add Absence**.
6. Administrator searches for and selects a teacher.
7. Administrator selects:
   - specific date,
   - date range, or
   - time range on a date.
8. Application creates relevant Needs Sub Assignments.
9. Default Sub Plan actions populate automatically where possible.
10. Conflicts remain marked Unresolved.
11. Administrator reviews the Affected Only list.
12. Administrator opens an unresolved Assignment.
13. Resolve Sub Need shows:
    - default;
    - School Sub;
    - available PLAN/Admin candidates;
    - workload information;
    - alternate actions.
14. Administrator assigns or otherwise resolves the need.
15. Administrator repeats until satisfied.
16. Administrator selects **Review & Finalize**.
17. App generates the text Sub Plan.
18. Administrator edits if desired.
19. Administrator selects **Copy to Clipboard**.
20. Administrator sends the message using the normal school communication workflow.

---

## 35. Required Acceptance Scenarios

The MVP is not complete until the following work end-to-end.

### Scenario A — Single Full-Day Absence

Given a normal B day and one absent teacher:

- correct affected responsibilities are generated;
- Default Sub Plan is applied;
- Default badges appear;
- unresolved items are clearly identified.

### Scenario B — Partial-Day Absence

Teacher is absent from 10:00 AM–1:30 PM.

Only overlapping responsibilities generate Assignments.

### Scenario C — Multi-Day Absence

Teacher is entered as absent for three dates.

Each date receives the appropriate daily plan based on that day's schedule.

### Scenario D — Multiple Simultaneous Absences

A Default Sub Plan calls for a teacher who is also absent.

The system:

- retains the default for reference;
- identifies the conflict;
- marks the Assignment unresolved;
- suggests alternatives.

### Scenario E — School Sub

The School Sub is available.

The School Sub appears prominently among recommended candidates and can be assigned.

### Scenario F — Workload Balancing

Teacher A has lost 1.50 plan periods in the rolling window.

Teacher B has lost 4.75.

Both are otherwise available.

Teacher A should rank ahead of Teacher B unless Default Sub Plan priority changes the recommendation.

Teacher B clearly displays the near-threshold warning.

### Scenario G — Threshold Crossing

Candidate currently has 4.75 lost plan periods.

Proposed assignment consumes 0.50 plan periods.

The drawer displays projected burden of:

**5.25**

before assignment.

### Scenario H — 40-Minute Teacher Covers 50 Minutes

A teacher has consecutive 40-minute PLAN blocks and provides 50 minutes of coverage spanning:

- 40 minutes of one PLAN block;
- 10 minutes of another.

Workload calculation returns:

**1.25 Plan Periods Lost**

### Scenario I — Split Assignment

A 50-minute class is resolved by:

- Teacher A for first 40 minutes;
- Teacher B for last 10 minutes.

The timeline and assignment both reflect the split correctly.

### Scenario J — Non-Class Responsibility

An absent teacher has lunch duty.

Administrator selects:

**Leave Uncovered**

The Assignment is considered deliberately resolved rather than Unresolved.

### Scenario K — Future Planning

Administrator navigates several days forward and enters a known upcoming absence.

The future Sub Plan is saved and remains available later.

### Scenario L — Schedule Refresh

Administrator uploads a newer normal schedule with an Effective From date.

The importer:

- validates it;
- creates a new schedule version;
- applies it beginning on the specified Effective From date;
- automatically allows the prior open-ended normal schedule to end immediately before the new schedule begins.

Previously finalized Sub Plans retain their original schedule data.

### Scenario M — Special Schedule

Administrator applies a special one-off schedule to a date.

Assignments for that date use the special schedule instead of the normal effective-dated A/B schedule.

The normal effective-dated schedule resumes automatically on the next applicable date.

### Scenario N — Message Generation

A completed Sub Plan generates editable text.

Administrator modifies the text and copies it to clipboard.

Regenerate reconstructs the output from current plan data.

---

## 36. Initial Implementation Boundary

The first implementation pass should deliver one complete vertical slice:

**Schedule Import → Date → Absence → Default Sub Plan → Resolve Assignments → Final Message**

Supporting features should be implemented only to the extent necessary for that workflow.

The first production-capable build does not need:

- rich reporting;
- teacher portals;
- automated communication;
- AI;
- mobile optimization;
- generalized school-management functionality.

---

## 37. Recommended Development Sequence

### Phase 1 — Foundation
- repository;
- React/Vite app;
- Cloudflare Worker;
- D1 database;
- migrations;
- local development;
- core layout;
- test fixtures.

### Phase 2 — Schedule
- spreadsheet importer;
- validation;
- effective-dated schedule versions;
- one-day special schedules;
- Staff/Rooms mapping;
- A/B schedules;
- Full Schedule timeline.

### Phase 3 — Daily Planning
- date navigation;
- Add Absence;
- Daily Sub Plan;
- Assignment generation;
- Default Sub Plan application.

### Phase 4 — Resolution
- Resolve Sub Need drawer;
- availability engine;
- workload calculation;
- assignment overrides;
- redistribution;
- split assignments;
- non-class uncovered option.

### Phase 5 — Output
- Review & Finalize;
- template;
- generated editable message;
- regenerate;
- copy to clipboard.

### Phase 6 — Production
- authentication/access control;
- school account configuration;
- production D1;
- deployment;
- initial real schedule;
- production Default Sub Plans;
- configurable school logo;
- realistic administrator testing.

---

## 38. Definition of MVP Success

The MVP succeeds if a school administrator can take the actual current schedule and Default Sub Plans, enter that day's absences, and create a practical Sub Plan **without manually cross-referencing the original schedule spreadsheet and Default Sub Plan document for ordinary cases**.

The application should do most of the routine preparation automatically while making unusual circumstances easier—not harder—to manage.

The administrator remains the final authority for every assignment.
