import { z } from 'zod';

import { parseLocalTime, parseSchoolDate } from '../src/domain/calendar';
import {
  readWorkbook,
  assertXlsxFileName,
  WorkbookReadError,
} from '../src/features/schedule-import/read-workbook';
import { schoolScheduleAdapter } from '../src/features/schedule-import/school-schedule-adapter';
import { ApplicationRepository } from './db/application-repository';
import { ImportRepository } from './db/import-repository';
import { PlanningRepository } from './db/planning-repository';
import { ScheduleRepository } from './db/schedule-repository';
import { HttpError, jsonError, jsonSuccess } from './http';
import { createRequestContext } from './identity';
import type { Env } from './types';

const dateSchema = z
  .string()
  .refine(isSchoolDate, 'Use a valid YYYY-MM-DD date.');
const timeSchema = z
  .string()
  .refine(isLocalTime, 'Use a valid 24-hour HH:MM time.');
const dayTypeSchema = z.enum(['A', 'B']);

const ensurePlanSchema = z.object({
  date: dateSchema,
  dayType: dayTypeSchema.optional(),
});
const absenceSchema = z
  .object({
    staffId: z.string().min(1),
    startDate: dateSchema,
    endDate: dateSchema,
    startTime: timeSchema.nullable().default(null),
    endTime: timeSchema.nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.startDate > value.endDate) {
      context.addIssue({
        code: 'custom',
        message: 'Start date must not be after end date.',
      });
    }
    const hasStart = value.startTime !== null;
    const hasEnd = value.endTime !== null;
    if (
      hasStart !== hasEnd ||
      (hasStart && value.startDate !== value.endDate)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Partial-day absences require both times on one specific date.',
      });
    }
    if (value.startTime && value.endTime && value.startTime >= value.endTime) {
      context.addIssue({
        code: 'custom',
        message: 'Start time must be before end time.',
      });
    }
  });
const mappingSchema = z.object({
  kind: z.enum(['staff', 'room']),
  displayValue: z.string().trim().min(1),
  targetId: z.string().optional(),
  createNew: z.boolean().default(false),
});
const activationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  confirmPredecessorClosure: z.boolean().default(false),
});
const specialActivationSchema = z.object({ confirmed: z.literal(true) });
const importConfigurationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('normal'),
      name: z.string().trim().min(1).max(120),
      effectiveFrom: dateSchema,
      effectiveTo: dateSchema.nullable(),
    })
    .superRefine((value, context) => {
      if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
        context.addIssue({
          code: 'custom',
          message: 'Effective To must not precede Effective From.',
        });
      }
    }),
  z.object({
    kind: z.literal('special'),
    name: z.string().trim().min(1).max(120),
    date: dateSchema,
  }),
]);
const scheduleConfigurationSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    effectiveFrom: dateSchema,
    effectiveTo: dateSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
      context.addIssue({
        code: 'custom',
        message: 'Effective To must not precede Effective From.',
      });
    }
  });
const specialScheduleConfigurationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  date: dateSchema,
});
const resolveSchema = z.object({
  action: z.enum(['assign', 'leave_uncovered', 'structured', 'split']),
  staffId: z.string().optional(),
  assignAnyway: z.boolean().default(false),
  acknowledged: z.boolean().default(false),
  resolutionType: z
    .enum([
      'redistribution',
      'switch_groups',
      'combine_class',
      'move_room',
      'manual_override',
    ])
    .optional(),
  details: z.record(z.string(), z.unknown()).default({}),
  segments: z
    .array(
      z.object({
        staffId: z.string().min(1),
        startTime: timeSchema,
        endTime: timeSchema,
      }),
    )
    .default([]),
});
const messageEditSchema = z.object({ editedText: z.string().max(100_000) });
const statusSchema = z.object({ status: z.enum(['draft', 'finalized']) });
const staffRoleSchema = z.enum(['Teacher', 'Administrator', 'Staff']);
const standardPeriodSchema = z.union([z.literal(40), z.literal(50), z.null()]);
const staffCreateSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  role: staffRoleSchema.default('Teacher'),
  canSub: z.boolean().default(true),
  isSchoolSub: z.boolean().default(false),
  standardPeriodMinutes: standardPeriodSchema.default(null),
});
const staffUpdateSchema = staffCreateSchema.required();
const aliasSchema = z.object({
  displayValue: z.string().trim().min(1).max(120),
});
const roomSchema = z.object({ name: z.string().trim().min(1).max(80) });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();

    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/')) {
        throw new HttpError(
          404,
          'not_found',
          'The requested API resource does not exist.',
        );
      }

      const applicationRepository = new ApplicationRepository(env.DB);
      if (url.pathname === '/api/health' && request.method === 'GET') {
        await applicationRepository.checkConnection();
        return jsonSuccess(
          {
            status: 'ok',
            database: 'connected',
            timestamp: new Date().toISOString(),
          },
          requestId,
        );
      }

      const context = await createRequestContext(env, requestId);
      const importRepository = new ImportRepository(env.DB);
      const planningRepository = new PlanningRepository(env.DB);
      const scheduleRepository = new ScheduleRepository(env.DB);

      if (url.pathname === '/api/bootstrap' && request.method === 'GET') {
        const bootstrap = await applicationRepository.getBootstrapSummary();
        return jsonSuccess(
          {
            ...bootstrap,
            actor: {
              displayName: context.actor.displayName,
              email: context.actor.email,
            },
          },
          requestId,
        );
      }

      if (url.pathname === '/api/staff' && request.method === 'GET') {
        return jsonSuccess(
          {
            staff: await applicationRepository.listStaff(
              url.searchParams.get('includeInactive') === 'true',
            ),
          },
          requestId,
        );
      }

      if (url.pathname === '/api/staff' && request.method === 'POST') {
        const body = staffCreateSchema.parse(await readJson(request));
        return jsonSuccess(
          { staff: await applicationRepository.createStaff(body) },
          requestId,
          201,
        );
      }

      const staffMatch = /^\/api\/staff\/([^/]+)$/.exec(url.pathname);
      if (staffMatch?.[1] && request.method === 'GET') {
        return jsonSuccess(
          {
            staff: await applicationRepository.getStaff(
              decodeURIComponent(staffMatch[1]),
            ),
          },
          requestId,
        );
      }
      if (staffMatch?.[1] && request.method === 'PATCH') {
        const body = staffUpdateSchema.parse(await readJson(request));
        return jsonSuccess(
          {
            staff: await applicationRepository.updateStaff(
              decodeURIComponent(staffMatch[1]),
              body,
            ),
          },
          requestId,
        );
      }

      const staffStatusMatch =
        /^\/api\/staff\/([^/]+)\/(deactivate|reactivate)$/.exec(url.pathname);
      if (
        staffStatusMatch?.[1] &&
        staffStatusMatch[2] &&
        request.method === 'POST'
      ) {
        return jsonSuccess(
          {
            staff: await applicationRepository.setStaffActive(
              decodeURIComponent(staffStatusMatch[1]),
              staffStatusMatch[2] === 'reactivate',
            ),
          },
          requestId,
        );
      }

      const staffAliasCollectionMatch = /^\/api\/staff\/([^/]+)\/aliases$/.exec(
        url.pathname,
      );
      if (staffAliasCollectionMatch?.[1] && request.method === 'POST') {
        const body = aliasSchema.parse(await readJson(request));
        return jsonSuccess(
          {
            staff: await applicationRepository.addStaffAlias(
              decodeURIComponent(staffAliasCollectionMatch[1]),
              body.displayValue,
            ),
          },
          requestId,
          201,
        );
      }

      const staffAliasMatch = /^\/api\/staff\/([^/]+)\/aliases\/([^/]+)$/.exec(
        url.pathname,
      );
      if (
        staffAliasMatch?.[1] &&
        staffAliasMatch[2] &&
        request.method === 'DELETE'
      ) {
        return jsonSuccess(
          {
            staff: await applicationRepository.removeStaffAlias(
              decodeURIComponent(staffAliasMatch[1]),
              decodeURIComponent(staffAliasMatch[2]),
            ),
          },
          requestId,
        );
      }

      if (url.pathname === '/api/rooms' && request.method === 'GET') {
        return jsonSuccess(
          {
            rooms: await applicationRepository.listRooms(
              url.searchParams.get('includeInactive') === 'true',
            ),
          },
          requestId,
        );
      }
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        const body = roomSchema.parse(await readJson(request));
        return jsonSuccess(
          { room: await applicationRepository.createRoom(body.name) },
          requestId,
          201,
        );
      }
      const roomMatch = /^\/api\/rooms\/([^/]+)$/.exec(url.pathname);
      if (roomMatch?.[1] && request.method === 'PATCH') {
        const body = roomSchema.parse(await readJson(request));
        return jsonSuccess(
          {
            room: await applicationRepository.updateRoom(
              decodeURIComponent(roomMatch[1]),
              body.name,
            ),
          },
          requestId,
        );
      }
      const roomStatusMatch =
        /^\/api\/rooms\/([^/]+)\/(deactivate|reactivate)$/.exec(url.pathname);
      if (
        roomStatusMatch?.[1] &&
        roomStatusMatch[2] &&
        request.method === 'POST'
      ) {
        return jsonSuccess(
          {
            room: await applicationRepository.setRoomActive(
              decodeURIComponent(roomStatusMatch[1]),
              roomStatusMatch[2] === 'reactivate',
            ),
          },
          requestId,
        );
      }

      if (
        url.pathname === '/api/schedule-imports' &&
        request.method === 'GET'
      ) {
        return jsonSuccess(
          { imports: await importRepository.list() },
          requestId,
        );
      }

      if (
        url.pathname === '/api/schedule-imports' &&
        request.method === 'POST'
      ) {
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) {
          throw new HttpError(
            400,
            'file_required',
            'Choose an .xlsx schedule workbook.',
          );
        }
        const kind = form.get('kind') === 'special' ? 'special' : 'normal';
        const name = z.string().trim().min(1).max(120).parse(form.get('name'));
        const effectiveFrom =
          kind === 'normal'
            ? dateSchema.parse(form.get('effectiveFrom'))
            : undefined;
        const effectiveToValue = form.get('effectiveTo');
        const effectiveTo =
          kind === 'normal' && effectiveToValue
            ? dateSchema.parse(effectiveToValue)
            : null;
        const specialDate =
          kind === 'special'
            ? dateSchema.parse(form.get('specialDate'))
            : undefined;
        if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
          throw new HttpError(
            400,
            'invalid_effective_range',
            'Effective To must not precede Effective From.',
          );
        }
        assertXlsxFileName(file.name);
        const bytes = await file.arrayBuffer();
        const workbook = await readWorkbook(bytes);
        const parsed = schoolScheduleAdapter.parse(workbook);
        if (!parsed.candidate) {
          throw new HttpError(
            400,
            'schedule_parse_failed',
            'The workbook has no interpretable schedule.',
          );
        }
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        const sha256 = [...new Uint8Array(hash)]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('');
        const result = await importRepository.stage({
          kind,
          name,
          fileName: file.name,
          sha256,
          effectiveFrom,
          effectiveTo,
          specialDate,
          candidate: parsed.candidate,
          issues: parsed.issues,
          actorId: context.actor.id,
        });
        return jsonSuccess({ import: result }, requestId, 201);
      }

      const importMatch = /^\/api\/schedule-imports\/([^/]+)$/.exec(
        url.pathname,
      );
      if (importMatch?.[1] && request.method === 'DELETE') {
        await importRepository.deleteStaged(importMatch[1]);
        return jsonSuccess({ deleted: true }, requestId);
      }
      if (importMatch?.[1] && request.method === 'GET') {
        return jsonSuccess(
          { import: await importRepository.get(importMatch[1]) },
          requestId,
        );
      }
      if (importMatch?.[1] && request.method === 'PATCH') {
        const body = importConfigurationSchema.parse(await readJson(request));
        return jsonSuccess(
          { import: await importRepository.configure(importMatch[1], body) },
          requestId,
        );
      }

      const mappingMatch = /^\/api\/schedule-imports\/([^/]+)\/mappings$/.exec(
        url.pathname,
      );
      if (mappingMatch?.[1] && request.method === 'POST') {
        const body = mappingSchema.parse(await readJson(request));
        return jsonSuccess(
          {
            import: await importRepository.mapValue({
              importId: mappingMatch[1],
              kind: body.kind,
              displayValue: body.displayValue,
              targetId: body.targetId,
              createNew: body.createNew,
            }),
          },
          requestId,
        );
      }

      const activateMatch = /^\/api\/schedule-imports\/([^/]+)\/activate$/.exec(
        url.pathname,
      );
      const activationPreviewMatch =
        /^\/api\/schedule-imports\/([^/]+)\/activation-preview$/.exec(
          url.pathname,
        );
      if (activationPreviewMatch?.[1] && request.method === 'GET') {
        return jsonSuccess(
          {
            preview: await importRepository.activationPreview(
              activationPreviewMatch[1],
            ),
          },
          requestId,
        );
      }
      if (activateMatch?.[1] && request.method === 'POST') {
        const body = activationSchema.parse(await readJson(request));
        return jsonSuccess(
          {
            import: await importRepository.activate(
              activateMatch[1],
              body.name,
              context.actor.id,
              body.confirmPredecessorClosure,
            ),
          },
          requestId,
        );
      }

      const activateSpecialMatch =
        /^\/api\/schedule-imports\/([^/]+)\/activate-special$/.exec(
          url.pathname,
        );
      if (activateSpecialMatch?.[1] && request.method === 'POST') {
        specialActivationSchema.parse(await readJson(request));
        return jsonSuccess(
          {
            import: await importRepository.activateSpecial(
              activateSpecialMatch[1],
              context.actor.id,
            ),
          },
          requestId,
        );
      }

      if (url.pathname === '/api/schedules' && request.method === 'GET') {
        return jsonSuccess(await scheduleRepository.list(), requestId);
      }

      const scheduleMatch = /^\/api\/schedules\/([^/]+)$/.exec(url.pathname);
      if (scheduleMatch?.[1] && request.method === 'PATCH') {
        const body = scheduleConfigurationSchema.parse(await readJson(request));
        return jsonSuccess(
          await scheduleRepository.configure(scheduleMatch[1], body),
          requestId,
        );
      }
      if (scheduleMatch?.[1] && request.method === 'DELETE') {
        return jsonSuccess(
          await scheduleRepository.delete(scheduleMatch[1]),
          requestId,
        );
      }

      const archiveScheduleMatch = /^\/api\/schedules\/([^/]+)\/archive$/.exec(
        url.pathname,
      );
      if (archiveScheduleMatch?.[1] && request.method === 'POST') {
        return jsonSuccess(
          await scheduleRepository.archive(archiveScheduleMatch[1]),
          requestId,
        );
      }

      const specialScheduleMatch = /^\/api\/special-schedules\/([^/]+)$/.exec(
        url.pathname,
      );
      if (specialScheduleMatch?.[1] && request.method === 'PATCH') {
        const body = specialScheduleConfigurationSchema.parse(
          await readJson(request),
        );
        return jsonSuccess(
          await scheduleRepository.configureSpecial(
            specialScheduleMatch[1],
            body,
          ),
          requestId,
        );
      }
      if (specialScheduleMatch?.[1] && request.method === 'DELETE') {
        return jsonSuccess(
          await scheduleRepository.deleteSpecial(specialScheduleMatch[1]),
          requestId,
        );
      }
      const archiveSpecialMatch =
        /^\/api\/special-schedules\/([^/]+)\/archive$/.exec(url.pathname);
      if (archiveSpecialMatch?.[1] && request.method === 'POST') {
        return jsonSuccess(
          await scheduleRepository.archiveSpecial(archiveSpecialMatch[1]),
          requestId,
        );
      }

      if (url.pathname === '/api/plans/ensure' && request.method === 'POST') {
        const body = ensurePlanSchema.parse(await readJson(request));
        return jsonSuccess(
          {
            detail: await planningRepository.ensurePlan(
              body.date,
              body.dayType,
              context.actor.id,
            ),
          },
          requestId,
        );
      }

      const planMatch = /^\/api\/plans\/(\d{4}-\d{2}-\d{2})$/.exec(
        url.pathname,
      );
      if (planMatch?.[1] && request.method === 'GET') {
        return jsonSuccess(
          { detail: await planningRepository.getPlan(planMatch[1]) },
          requestId,
        );
      }

      if (url.pathname === '/api/absences' && request.method === 'POST') {
        const body = absenceSchema.parse(await readJson(request));
        const result = await planningRepository.addAbsence(
          body,
          context.actor.id,
        );
        return jsonSuccess(result, requestId, 201);
      }

      const candidatesMatch = /^\/api\/assignments\/([^/]+)\/candidates$/.exec(
        url.pathname,
      );
      if (candidatesMatch?.[1] && request.method === 'GET') {
        return jsonSuccess(
          await planningRepository.candidates(
            decodeURIComponent(candidatesMatch[1]),
          ),
          requestId,
        );
      }

      const resolveMatch = /^\/api\/assignments\/([^/]+)\/resolve$/.exec(
        url.pathname,
      );
      if (resolveMatch?.[1] && request.method === 'POST') {
        const body = resolveSchema.parse(await readJson(request));
        const assignmentId = decodeURIComponent(resolveMatch[1]);
        let detail;
        if (body.action === 'assign') {
          if (!body.staffId)
            throw new HttpError(400, 'staff_required', 'Choose a candidate.');
          detail = await planningRepository.assign(
            assignmentId,
            body.staffId,
            body.assignAnyway,
            context.actor.id,
          );
        } else if (body.action === 'leave_uncovered') {
          detail = await planningRepository.leaveUncovered(
            assignmentId,
            body.acknowledged,
            context.actor.id,
          );
        } else if (body.action === 'structured') {
          if (!body.resolutionType) {
            throw new HttpError(
              400,
              'resolution_type_required',
              'Choose a structured resolution type.',
            );
          }
          detail = await planningRepository.structuredResolution(
            assignmentId,
            body.resolutionType,
            body.details,
            context.actor.id,
          );
        } else {
          detail = await planningRepository.split(
            assignmentId,
            body.segments,
            body.assignAnyway,
            context.actor.id,
          );
        }
        return jsonSuccess({ detail }, requestId);
      }

      const regenerateMatch =
        /^\/api\/plans\/(\d{4}-\d{2}-\d{2})\/message\/regenerate$/.exec(
          url.pathname,
        );
      if (regenerateMatch?.[1] && request.method === 'POST') {
        return jsonSuccess(
          {
            detail: await planningRepository.regenerateMessage(
              regenerateMatch[1],
              context.actor.id,
            ),
          },
          requestId,
        );
      }

      const messageMatch = /^\/api\/plans\/(\d{4}-\d{2}-\d{2})\/message$/.exec(
        url.pathname,
      );
      if (messageMatch?.[1] && request.method === 'PATCH') {
        const body = messageEditSchema.parse(await readJson(request));
        return jsonSuccess(
          {
            detail: await planningRepository.editMessage(
              messageMatch[1],
              body.editedText,
            ),
          },
          requestId,
        );
      }

      const statusMatch = /^\/api\/plans\/(\d{4}-\d{2}-\d{2})\/status$/.exec(
        url.pathname,
      );
      if (statusMatch?.[1] && request.method === 'POST') {
        const body = statusSchema.parse(await readJson(request));
        return jsonSuccess(
          {
            detail: await planningRepository.setStatus(
              statusMatch[1],
              body.status,
              context.actor.id,
            ),
          },
          requestId,
        );
      }

      throw new HttpError(
        404,
        'not_found',
        'The requested API resource does not exist.',
      );
    } catch (cause) {
      if (cause instanceof HttpError) return jsonError(cause, requestId);
      if (cause instanceof z.ZodError) {
        return jsonError(
          new HttpError(
            400,
            'invalid_request',
            cause.issues[0]?.message ?? 'Invalid request.',
          ),
          requestId,
        );
      }
      if (cause instanceof WorkbookReadError) {
        return jsonError(
          new HttpError(400, cause.code, cause.message),
          requestId,
        );
      }
      console.error('Unhandled API error', { requestId, cause });
      return jsonError(
        new HttpError(
          500,
          'internal_error',
          'The server could not complete the request.',
        ),
        requestId,
      );
    }
  },
} satisfies ExportedHandler<Env>;

async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new HttpError(
      415,
      'unsupported_media_type',
      'Send a JSON request body.',
    );
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(
      400,
      'invalid_json',
      'The request body is not valid JSON.',
    );
  }
}

function isSchoolDate(value: string): boolean {
  try {
    parseSchoolDate(value);
    return true;
  } catch {
    return false;
  }
}

function isLocalTime(value: string): boolean {
  try {
    parseLocalTime(value);
    return true;
  } catch {
    return false;
  }
}
