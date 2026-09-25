import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { demoCommand } from './demo';
export const desktop = isTauri();
export const command = <T = void>(name: string, args?: Record<string, unknown>): Promise<T> =>
  desktop ? invoke<T>(name, args) : demoCommand<T>(name, args);
export async function subscribe(refresh: () => void) {
  if (desktop) return listen('clipnest:changed', refresh);
  window.addEventListener('clipnest-demo', refresh);
  return () => window.removeEventListener('clipnest-demo', refresh);
}
