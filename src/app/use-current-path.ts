import { useEffect, useState } from 'react';

function normalizedPath(): string {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path || '/';
}

export function useCurrentPath(): [string, (path: string) => void] {
  const [path, setPath] = useState(normalizedPath);

  useEffect(() => {
    const handlePopState = () => setPath(normalizedPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (nextPath: string) => {
    if (nextPath !== normalizedPath()) {
      window.history.pushState({}, '', nextPath);
      setPath(nextPath);
    }
  };

  return [path, navigate];
}
