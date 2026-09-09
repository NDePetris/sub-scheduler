import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  getGeneralSettings,
  updateGeneralSettings,
  type GeneralSettingsData,
} from '@/lib/api';

export function GeneralSettingsWorkspace({
  onSchoolNameChanged,
}: {
  readonly onSchoolNameChanged: () => void;
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
      onSchoolNameChanged();
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
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button disabled={saving !== null} onClick={() => void saveSchool()}>
            {saving === 'school' ? 'Saving…' : 'Save School'}
          </Button>
          {saved === 'school' && (
            <p className="text-brand-dark text-sm" role="status">
              School settings saved.
            </p>
          )}
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
