import { useEffect, useRef, useState } from 'react';
import { GraduationCap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  removeSchoolLogo,
  uploadSchoolLogo,
  getGeneralSettings,
  updateGeneralSettings,
  type GeneralSettingsData,
} from '@/lib/api';

export function GeneralSettingsWorkspace({
  onApplicationSettingsChanged,
}: {
  readonly onApplicationSettingsChanged: () => void;
}) {
  const [settings, setSettings] = useState<GeneralSettingsData | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [threshold, setThreshold] = useState('');
  const [windowDays, setWindowDays] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schoolError, setSchoolError] = useState<string | null>(null);
  const [workloadError, setWorkloadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'school' | 'workload' | null>(null);
  const [saved, setSaved] = useState<'school' | 'workload' | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoSaved, setLogoSaved] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const clearLogoFile = () => {
    setLogoFile(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const saveLogo = async () => {
    if (!logoFile) {
      setLogoError('Choose a PNG, JPEG, or WebP logo first.');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(logoFile.type)) {
      setLogoError('Choose a PNG, JPEG, or WebP image.');
      return;
    }
    if (logoFile.size > 2 * 1024 * 1024) {
      setLogoError('School logos must be 2 MiB or smaller.');
      return;
    }
    setLogoError(null);
    setLogoSaved(null);
    setLogoSaving(true);
    try {
      const updated = await uploadSchoolLogo(logoFile);
      setSettings(updated);
      clearLogoFile();
      setLogoSaved('Logo saved.');
      onApplicationSettingsChanged();
    } catch (cause) {
      setLogoError(message(cause));
    } finally {
      setLogoSaving(false);
    }
  };

  const deleteLogo = async () => {
    setLogoError(null);
    setLogoSaved(null);
    setLogoSaving(true);
    try {
      const updated = await removeSchoolLogo();
      setSettings(updated);
      clearLogoFile();
      setLogoSaved('Logo removed.');
      onApplicationSettingsChanged();
    } catch (cause) {
      setLogoError(message(cause));
    } finally {
      setLogoSaving(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void getGeneralSettings(controller.signal)
      .then((data) => {
        setSettings(data);
        setSchoolName(data.schoolName);
        setThreshold(String(data.workloadWarningThreshold));
        setWindowDays(String(data.workloadWindowDays));
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError')
          return;
        setError(message(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const saveSchool = async () => {
    setSchoolError(null);
    setSaved(null);
    if (!schoolName.trim()) {
      setSchoolError('School name is required.');
      return;
    }
    setSaving('school');
    try {
      const updated = await updateGeneralSettings({ schoolName });
      setSettings(updated);
      setSchoolName(updated.schoolName);
      setSaved('school');
      onApplicationSettingsChanged();
    } catch (cause) {
      setSchoolError(message(cause));
    } finally {
      setSaving(null);
    }
  };

  const saveWorkload = async () => {
    setWorkloadError(null);
    setSaved(null);
    const workloadWarningThreshold = Number(threshold);
    const workloadWindowDays = Number(windowDays);
    if (
      !Number.isFinite(workloadWarningThreshold) ||
      workloadWarningThreshold <= 0
    ) {
      setWorkloadError('Workload warning threshold must be greater than zero.');
      return;
    }
    if (!Number.isInteger(workloadWindowDays) || workloadWindowDays <= 0) {
      setWorkloadError(
        'Rolling workload window must be a whole number greater than zero.',
      );
      return;
    }
    setSaving('workload');
    try {
      const updated = await updateGeneralSettings({
        workloadWarningThreshold,
        workloadWindowDays,
      });
      setSettings(updated);
      setThreshold(String(updated.workloadWarningThreshold));
      setWindowDays(String(updated.workloadWindowDays));
      setSaved('workload');
    } catch (cause) {
      setWorkloadError(message(cause));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="border-border rounded-lg border bg-white p-5 text-sm">
        Loading general settings…
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div
        className="border-danger/30 bg-danger-soft text-danger-dark rounded-lg border p-5 text-sm"
        role="alert"
      >
        {error ?? 'General settings are unavailable.'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-muted-foreground text-sm">School administration</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          General Settings
        </h1>
      </div>

      <section
        className="border-border rounded-lg border bg-white p-5"
        aria-labelledby="school-settings-heading"
      >
        <h2 id="school-settings-heading" className="text-base font-bold">
          School
        </h2>
        <div className="mt-4 max-w-lg">
          <label className="block text-sm font-semibold" htmlFor="school-name">
            School name
          </label>
          <input
            id="school-name"
            className="field mt-1.5"
            value={schoolName}
            onChange={(event) => setSchoolName(event.target.value)}
            aria-describedby={schoolError ? 'school-name-error' : undefined}
          />
          {schoolError && (
            <p
              id="school-name-error"
              className="text-danger-dark mt-2 text-sm"
              role="alert"
            >
              {schoolError}
            </p>
          )}
          <div className="mt-5 flex items-center gap-3">
            <Button
              disabled={saving !== null}
              onClick={() => void saveSchool()}
            >
              {saving === 'school' ? 'Saving…' : 'Save School'}
            </Button>
            {saved === 'school' && (
              <p className="text-brand-dark text-sm" role="status">
                School settings saved.
              </p>
            )}
          </div>
          <div className="mt-6 border-t pt-5">
            <h3 className="text-sm font-semibold">School logo</h3>
            <div className="mt-3 flex items-center gap-4">
              {settings.schoolLogoUrl ? (
                <img
                  src={settings.schoolLogoUrl}
                  alt="Current school logo"
                  className="size-14 rounded-md object-contain"
                />
              ) : (
                <span
                  className="bg-brand-soft text-brand-dark flex size-14 items-center justify-center rounded-md"
                  aria-hidden="true"
                >
                  <GraduationCap className="size-7" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p
                  id="school-logo-constraints"
                  className="text-muted-foreground text-sm"
                >
                  PNG, JPEG, or WebP · Max 2 MiB
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Button asChild variant="secondary">
                    <label
                      htmlFor="school-logo"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          logoInputRef.current?.click();
                        }
                      }}
                    >
                      Choose image
                    </label>
                  </Button>
                  <p
                    id="school-logo-file-name"
                    className="text-muted-foreground min-w-0 truncate text-sm"
                    role="status"
                  >
                    {logoFile ? logoFile.name : 'No file selected'}
                  </p>
                </div>
                <input
                  ref={logoInputRef}
                  id="school-logo"
                  className="sr-only"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-describedby="school-logo-constraints school-logo-file-name"
                  onChange={(event) => {
                    setLogoFile(event.target.files?.[0] ?? null);
                    setLogoError(null);
                    setLogoSaved(null);
                  }}
                />
                {logoError && (
                  <p className="text-danger-dark mt-2 text-sm" role="alert">
                    {logoError}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    disabled={logoSaving || saving !== null || !logoFile}
                    onClick={() => void saveLogo()}
                  >
                    {logoSaving
                      ? 'Saving…'
                      : settings.schoolLogoUrl
                        ? 'Replace Logo'
                        : 'Upload Logo'}
                  </Button>
                  {settings.schoolLogoUrl && (
                    <Button
                      disabled={logoSaving || saving !== null}
                      variant="secondary"
                      onClick={() => void deleteLogo()}
                    >
                      Remove Logo
                    </Button>
                  )}
                  {logoSaved && (
                    <p className="text-brand-dark text-sm" role="status">
                      {logoSaved}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="border-border rounded-lg border bg-white p-5"
        aria-labelledby="workload-settings-heading"
      >
        <h2 id="workload-settings-heading" className="text-base font-bold">
          Coverage workload
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          These settings control Plan Periods Lost workload warnings when staff
          are considered for coverage.
        </p>
        <div className="mt-4 grid max-w-xl gap-4 sm:grid-cols-2">
          <div>
            <label
              className="block text-sm font-semibold"
              htmlFor="workload-threshold"
            >
              Workload warning threshold
            </label>
            <input
              id="workload-threshold"
              className="field mt-1.5"
              type="number"
              min="0"
              step="any"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              aria-describedby={workloadError ? 'workload-error' : undefined}
            />
          </div>
          <div>
            <label
              className="block text-sm font-semibold"
              htmlFor="workload-window-days"
            >
              Rolling workload window (calendar days)
            </label>
            <input
              id="workload-window-days"
              className="field mt-1.5"
              type="number"
              min="1"
              step="1"
              value={windowDays}
              onChange={(event) => setWindowDays(event.target.value)}
              aria-describedby={workloadError ? 'workload-error' : undefined}
            />
          </div>
        </div>
        {workloadError && (
          <p
            id="workload-error"
            className="text-danger-dark mt-2 text-sm"
            role="alert"
          >
            {workloadError}
          </p>
        )}
        <div className="mt-5 flex items-center gap-3">
          <Button
            disabled={saving !== null}
            onClick={() => void saveWorkload()}
          >
            {saving === 'workload' ? 'Saving…' : 'Save Workload Settings'}
          </Button>
          {saved === 'workload' && (
            <p className="text-brand-dark text-sm" role="status">
              Coverage workload settings saved.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function message(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'The request could not be completed.';
}
