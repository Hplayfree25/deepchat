'use client';

import React, { useSyncExternalStore } from 'react';

export function useIsMounted() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
}

export function useClientOnly<T>(value: T, defaultValue: T): T {
  const mounted = useIsMounted();
  return mounted ? value : defaultValue;
}

export function ClientOnly({ children, fallback = null }: { children: React.ReactNode, fallback?: React.ReactNode }) {
  const mounted = useIsMounted();

  if (!mounted) {
    return fallback;
  }

  return React.createElement(React.Fragment, null, children);
}
