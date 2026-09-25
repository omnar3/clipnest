import { useCallback, useEffect, useRef, useState } from 'react';
import { command, subscribe } from './api';
import type { Snapshot } from './types';
export function useWorkspace() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const running = useRef(false);
  const pending = useRef(false);
  const refresh = useCallback(async () => {
    pending.current = true;
    if (running.current) return;
    running.current = true;
    try {
      while (pending.current && active.current) {
        pending.current = false;
        try {
          const next = await command<Snapshot>('get_snapshot');
          if (active.current) {
            setData(next);
            setError(null);
          }
        } catch (e) {
          if (active.current) setError(String(e));
        }
      }
    } finally {
      running.current = false;
    }
  }, []);
  useEffect(() => {
    active.current = true;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void subscribe(() => void refresh())
      .then((fn) => {
        if (disposed) fn();
        else {
          unsubscribe = fn;
          void refresh();
        }
      })
      .catch((e) => {
        setError(String(e));
      });
    void refresh();
    return () => {
      disposed = true;
      active.current = false;
      unsubscribe?.();
    };
  }, [refresh]);
  return { data, error, refresh };
}
