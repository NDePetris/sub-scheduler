import { useCallback, useEffect, useState } from 'react';

import { SubPlanFoundation } from '@/features/sub-plan/sub-plan-foundation';
import { getBootstrapData, type BootstrapData } from '@/lib/api';

import { ApplicationShell } from './application-shell';
import { navigationItemForPath } from './navigation';
import { SectionPlaceholder } from './section-placeholder';
import { useCurrentPath } from './use-current-path';

export function App() {
  const [path, navigate] = useCurrentPath();
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadBootstrap = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      setBootstrap(await getBootstrapData(signal));
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(
        cause instanceof Error
          ? cause.message
          : 'The application API is unavailable.',
      );
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void getBootstrapData(controller.signal)
      .then((data) => {
        setBootstrap(data);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError')
          return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'The application API is unavailable.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, []);

  const activeItem = navigationItemForPath(path);
  const content =
    activeItem.path === '/' ? (
      <SubPlanFoundation
        bootstrap={bootstrap}
        error={error}
        isLoading={isLoading}
        onRetry={() => void loadBootstrap()}
      />
    ) : (
      <SectionPlaceholder item={activeItem} />
    );

  return (
    <ApplicationShell
      activePath={activeItem.path}
      bootstrap={bootstrap}
      onNavigate={navigate}
    >
      {content}
    </ApplicationShell>
  );
}
