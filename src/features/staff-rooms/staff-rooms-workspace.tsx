import {
  Building2,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  addStaffAlias,
  createRoom,
  createStaff,
  listRooms,
  listStaff,
  removeStaffAlias,
  setRoomActive,
  setStaffActive,
  updateRoom,
  updateStaff,
  type ManagedStaffData,
  type RoomData,
  type StaffRole,
  type StaffWriteInput,
} from '@/lib/api';
import { cn } from '@/lib/cn';

type Section = 'staff' | 'rooms';

const emptyStaff: StaffWriteInput = {
  displayName: '',
  role: 'Teacher',
  canSub: true,
  isSchoolSub: false,
  standardPeriodMinutes: null,
};

export function StaffRoomsWorkspace({
  onChanged,
}: {
  readonly onChanged?: () => void;
}) {
  const [section, setSection] = useState<Section>('staff');
  const [staff, setStaff] = useState<ManagedStaffData[]>([]);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingStaff, setEditingStaff] = useState<
    ManagedStaffData | 'new' | null
  >(null);
  const [editingRoom, setEditingRoom] = useState<RoomData | 'new' | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [nextStaff, nextRooms] = await Promise.all([
        listStaff(undefined, true),
        listRooms(undefined, true),
      ]);
      setStaff(nextStaff);
      setRooms(nextRooms);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      listStaff(controller.signal, true),
      listRooms(controller.signal, true),
    ])
      .then(([nextStaff, nextRooms]) => {
        setStaff(nextStaff);
        setRooms(nextRooms);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError')
          return;
        setError(message(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, []);

  const query = search.trim().toLocaleLowerCase();
  const visibleStaff = useMemo(
    () =>
      staff.filter(
        (person) =>
          (showInactive || person.isActive) &&
          (!query ||
            person.displayName.toLocaleLowerCase().includes(query) ||
            person.aliases.some((alias) =>
              alias.displayValue.toLocaleLowerCase().includes(query),
            )),
      ),
    [query, showInactive, staff],
  );
  const visibleRooms = useMemo(
    () =>
      rooms.filter(
        (room) =>
          (showInactive || room.isActive) &&
          (!query || room.name.toLocaleLowerCase().includes(query)),
      ),
    [query, rooms, showInactive],
  );

  const changed = async () => {
    await load();
    onChanged?.();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Configuration
          </p>
          <h1 className="mt-1 text-2xl font-bold">Staff &amp; Rooms</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage the stable people and places used by schedules and Sub Plans.
          </p>
        </div>
        <Button
          onClick={() =>
            section === 'staff' ? setEditingStaff('new') : setEditingRoom('new')
          }
        >
          <Plus className="size-4" aria-hidden="true" /> Add{' '}
          {section === 'staff' ? 'Staff' : 'Room'}
        </Button>
      </div>

      <div className="border-border flex items-center justify-between rounded-lg border bg-white p-2">
        <div
          className="flex gap-1"
          role="tablist"
          aria-label="Staff and room configuration"
        >
          <Tab
            active={section === 'staff'}
            onClick={() => setSection('staff')}
            icon={<UserRound className="size-4" />}
          >
            Staff{' '}
            <Badge>{staff.filter((person) => person.isActive).length}</Badge>
          </Tab>
          <Tab
            active={section === 'rooms'}
            onClick={() => setSection('rooms')}
            icon={<Building2 className="size-4" />}
          >
            Rooms <Badge>{rooms.filter((room) => room.isActive).length}</Badge>
          </Tab>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Show inactive
          </label>
          <label className="relative block">
            <Search
              className="text-muted-foreground absolute top-2 left-2.5 size-4"
              aria-hidden="true"
            />
            <span className="sr-only">Search {section}</span>
            <input
              className="field w-64 pl-8"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${section}…`}
            />
          </label>
        </div>
      </div>

      {error && (
        <div
          className="border-danger/30 bg-danger-soft text-danger-dark rounded-lg border p-3 text-sm"
          role="alert"
        >
          {error}
        </div>
      )}
      {isLoading ? (
        <div className="border-border rounded-lg border bg-white p-8 text-center text-sm">
          Loading configuration…
        </div>
      ) : section === 'staff' ? (
        <StaffTable staff={visibleStaff} onEdit={setEditingStaff} />
      ) : (
        <RoomsTable rooms={visibleRooms} onEdit={setEditingRoom} />
      )}

      {editingStaff && (
        <StaffEditor
          staff={editingStaff === 'new' ? null : editingStaff}
          onClose={() => setEditingStaff(null)}
          onChanged={changed}
        />
      )}
      {editingRoom && (
        <RoomEditor
          room={editingRoom === 'new' ? null : editingRoom}
          onClose={() => setEditingRoom(null)}
          onChanged={changed}
        />
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  icon,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly icon: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold',
        active
          ? 'bg-brand-soft text-brand-dark'
          : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function StaffTable({
  staff,
  onEdit,
}: {
  readonly staff: readonly ManagedStaffData[];
  readonly onEdit: (staff: ManagedStaffData) => void;
}) {
  return (
    <div className="border-border overflow-hidden rounded-lg border bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-muted/70 text-muted-foreground text-xs uppercase">
          <tr>
            <th className="px-4 py-3">Staff</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Standard Period</th>
            <th className="px-4 py-3">Can Sub</th>
            <th className="px-4 py-3">School Sub</th>
            <th className="px-4 py-3 text-right">Status / actions</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((person) => (
            <tr
              key={person.id}
              className="border-border hover:bg-muted/35 border-t"
            >
              <td className="px-4 py-3">
                <button
                  className="font-semibold hover:underline"
                  onClick={() => onEdit(person)}
                >
                  {person.displayName}
                </button>
                {person.aliases.length > 0 && (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {person.aliases.length} schedule{' '}
                    {person.aliases.length === 1 ? 'name' : 'names'}
                  </p>
                )}
              </td>
              <td className="px-4 py-3">{person.role}</td>
              <td className="px-4 py-3">{periodLabel(person)}</td>
              <td className="px-4 py-3">{person.canSub ? <Yes /> : 'No'}</td>
              <td className="px-4 py-3">
                {person.isSchoolSub ? (
                  <Badge className="border-brand/30 bg-brand-soft text-brand-dark">
                    School Sub
                  </Badge>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  {!person.isActive && <Badge>Inactive</Badge>}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onEdit(person)}
                  >
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {staff.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="text-muted-foreground px-4 py-10 text-center"
              >
                No staff match this view.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RoomsTable({
  rooms,
  onEdit,
}: {
  readonly rooms: readonly RoomData[];
  readonly onEdit: (room: RoomData) => void;
}) {
  return (
    <div className="border-border overflow-hidden rounded-lg border bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-muted/70 text-muted-foreground text-xs uppercase">
          <tr>
            <th className="px-4 py-3">Room</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => (
            <tr
              key={room.id}
              className="border-border hover:bg-muted/35 border-t"
            >
              <td className="px-4 py-3 font-semibold">{room.name}</td>
              <td className="px-4 py-3">
                {room.isActive ? (
                  <Badge className="border-brand/30 bg-brand-soft text-brand-dark">
                    Active
                  </Badge>
                ) : (
                  <Badge>Inactive</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onEdit(room)}
                >
                  <Pencil className="size-3.5" /> Edit
                </Button>
              </td>
            </tr>
          ))}
          {rooms.length === 0 && (
            <tr>
              <td
                colSpan={3}
                className="text-muted-foreground px-4 py-10 text-center"
              >
                No rooms match this view.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StaffEditor({
  staff,
  onClose,
  onChanged,
}: {
  readonly staff: ManagedStaffData | null;
  readonly onClose: () => void;
  readonly onChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState<StaffWriteInput>(
    staff
      ? {
          displayName: staff.displayName,
          role: staff.role,
          canSub: staff.canSub,
          isSchoolSub: staff.isSchoolSub,
          standardPeriodMinutes: asPeriod(staff.standardPeriodMinutes),
        }
      : emptyStaff,
  );
  const [current, setCurrent] = useState(staff);
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const run = async (operation: () => Promise<ManagedStaffData>) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await operation();
      setCurrent(updated);
      await onChanged();
      return true;
    } catch (cause) {
      setError(message(cause));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    const success = await run(() =>
      current ? updateStaff(current.id, form) : createStaff(form),
    );
    if (success) onClose();
  };
  const changeCanSub = (canSub: boolean) =>
    setForm((value) => ({
      ...value,
      canSub,
      isSchoolSub: canSub ? value.isSchoolSub : false,
    }));
  const changeSchoolSub = (isSchoolSub: boolean) =>
    setForm((value) => ({
      ...value,
      isSchoolSub,
      canSub: isSchoolSub ? true : value.canSub,
    }));

  return (
    <Drawer title={current ? 'Staff Details' : 'Add Staff'} onClose={onClose}>
      <div className="space-y-5">
        {error && (
          <div
            className="border-danger/30 bg-danger-soft text-danger-dark rounded-md border p-3 text-sm"
            role="alert"
          >
            {error}
          </div>
        )}
        <Field label="Name">
          <input
            className="field"
            value={form.displayName}
            onChange={(event) =>
              setForm({ ...form, displayName: event.target.value })
            }
            autoFocus
            required
          />
        </Field>
        <Field label="Role">
          <select
            className="field"
            value={form.role}
            onChange={(event) =>
              setForm({ ...form, role: event.target.value as StaffRole })
            }
          >
            <option>Teacher</option>
            <option>Administrator</option>
            <option>Staff</option>
          </select>
        </Field>
        <Field
          label="Standard Period"
          help="Used to calculate Plan Periods Lost when this staff member gives up PLAN time to cover another class."
        >
          <select
            className="field"
            value={form.standardPeriodMinutes ?? 'auto'}
            onChange={(event) =>
              setForm({
                ...form,
                standardPeriodMinutes:
                  event.target.value === 'auto'
                    ? null
                    : (Number(event.target.value) as 40 | 50),
              })
            }
          >
            <option value="auto">
              Auto
              {current?.inferredStandardPeriodMinutes
                ? ` — currently ${current.inferredStandardPeriodMinutes} minutes`
                : ' — not detected'}
            </option>
            <option value="40">40 minutes</option>
            <option value="50">50 minutes</option>
          </select>
        </Field>
        <div className="border-border space-y-3 rounded-md border p-3">
          <Toggle
            checked={form.canSub}
            onChange={changeCanSub}
            label="Can be assigned as a Sub"
          />
          <Toggle
            checked={form.isSchoolSub}
            onChange={changeSchoolSub}
            label="School Sub"
            help="School Sub automatically enables Can Sub and receives School Sub ranking priority."
          />
        </div>

        {current && (
          <div className="border-border border-t pt-5">
            <h3 className="font-semibold">Imported Schedule Names</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Alternate names match future imports only. Historical schedules
              remain unchanged.
            </p>
            <div className="mt-3 space-y-2">
              {current.aliases.map((item) => (
                <div
                  key={item.id}
                  className="bg-muted flex items-center justify-between rounded-md px-3 py-2 text-sm"
                >
                  <span>{item.displayValue}</span>
                  <button
                    className="text-danger-dark text-xs font-semibold hover:underline"
                    disabled={busy}
                    onClick={() =>
                      void run(() => removeStaffAlias(current.id, item.id))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              {current.aliases.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No alternate schedule names.
                </p>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="field"
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
                placeholder="Add schedule name"
              />
              <Button
                variant="secondary"
                disabled={busy || !alias.trim()}
                onClick={() =>
                  void run(() => addStaffAlias(current.id, alias)).then(
                    (ok) => {
                      if (ok) setAlias('');
                    },
                  )
                }
              >
                Add
              </Button>
            </div>
          </div>
        )}

        {confirmDeactivate && current?.isActive && (
          <div className="border-danger/30 bg-danger-soft rounded-md border p-3">
            <p className="text-danger-dark text-sm font-semibold">
              Deactivate this staff member?
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              They will leave active selectors and recommendations. Historical
              schedules and Sub Plans remain unchanged.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConfirmDeactivate(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={busy}
                className="bg-danger hover:bg-danger-dark"
                onClick={() =>
                  void run(() => setStaffActive(current.id, false)).then(
                    (ok) => {
                      if (ok) onClose();
                    },
                  )
                }
              >
                Confirm Deactivation
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          {current ? (
            <Button
              variant="ghost"
              disabled={busy}
              className={current.isActive ? 'text-danger-dark' : ''}
              onClick={() =>
                current.isActive
                  ? setConfirmDeactivate(true)
                  : void run(() => setStaffActive(current.id, true)).then(
                      (ok) => {
                        if (ok) onClose();
                      },
                    )
              }
            >
              {current.isActive ? (
                'Deactivate Staff'
              ) : (
                <>
                  <RotateCcw className="size-4" /> Reactivate Staff
                </>
              )}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={busy || !form.displayName.trim()}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : current ? 'Save Changes' : 'Add Staff'}
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function RoomEditor({
  room,
  onClose,
  onChanged,
}: {
  readonly room: RoomData | null;
  readonly onClose: () => void;
  readonly onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(room?.name ?? '');
  const [current, setCurrent] = useState(room);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const run = async (operation: () => Promise<RoomData>, close = false) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await operation();
      setCurrent(updated);
      await onChanged();
      if (close) onClose();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer title={current ? 'Room Details' : 'Add Room'} onClose={onClose}>
      <div className="space-y-5">
        {error && (
          <div
            className="border-danger/30 bg-danger-soft text-danger-dark rounded-md border p-3 text-sm"
            role="alert"
          >
            {error}
          </div>
        )}
        <Field label="Room name">
          <input
            className="field"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </Field>
        <p className="text-muted-foreground text-sm">
          Renaming or deactivating a room keeps its historical schedule
          relationships intact.
        </p>
        {confirmDeactivate && current?.isActive && (
          <div className="border-danger/30 bg-danger-soft rounded-md border p-3">
            <p className="text-danger-dark text-sm font-semibold">
              Deactivate this room?
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              It will leave active selectors while historical schedules remain
              unchanged.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConfirmDeactivate(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={busy}
                className="bg-danger hover:bg-danger-dark"
                onClick={() =>
                  void run(() => setRoomActive(current.id, false), true)
                }
              >
                Confirm Deactivation
              </Button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          {current ? (
            <Button
              variant="ghost"
              className={current.isActive ? 'text-danger-dark' : ''}
              disabled={busy}
              onClick={() =>
                current.isActive
                  ? setConfirmDeactivate(true)
                  : void run(() => setRoomActive(current.id, true), true)
              }
            >
              {current.isActive ? (
                'Deactivate Room'
              ) : (
                <>
                  <RotateCcw className="size-4" /> Reactivate Room
                </>
              )}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={busy || !name.trim()}
              onClick={() =>
                void run(
                  () =>
                    current ? updateRoom(current.id, name) : createRoom(name),
                  true,
                )
              }
            >
              {busy ? 'Saving…' : current ? 'Save Changes' : 'Add Room'}
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function Drawer({
  title,
  onClose,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/25"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="h-full w-[31rem] overflow-y-auto bg-white shadow-2xl"
      >
        <header className="border-border sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-white px-5">
          <h2 id="drawer-title" className="text-lg font-bold">
            {title}
          </h2>
          <button
            aria-label="Close"
            className="hover:bg-muted rounded-md p-2"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  readonly label: string;
  readonly help?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <div className="mt-1.5">{children}</div>
      {help && (
        <span className="text-muted-foreground mt-1.5 block text-xs leading-relaxed font-normal">
          {help}
        </span>
      )}
    </label>
  );
}
function Toggle({
  checked,
  onChange,
  label,
  help,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly help?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        className="mt-0.5 size-4"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {help && (
          <span className="text-muted-foreground mt-0.5 block text-xs">
            {help}
          </span>
        )}
      </span>
    </label>
  );
}
function Yes() {
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Check className="text-brand-dark size-4" /> Yes
    </span>
  );
}
function periodLabel(staff: ManagedStaffData) {
  return staff.standardPeriodMinutes
    ? `${staff.standardPeriodMinutes} min`
    : staff.inferredStandardPeriodMinutes
      ? `Auto · ${staff.inferredStandardPeriodMinutes} min`
      : 'Auto · Not detected';
}
function asPeriod(value: number | null): 40 | 50 | null {
  return value === 40 || value === 50 ? value : null;
}
function message(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'The request could not be completed.';
}
