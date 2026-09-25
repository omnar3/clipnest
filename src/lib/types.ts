export type Kind = 'text' | 'link' | 'code';
export type Color = 'mint' | 'blue' | 'violet' | 'amber' | 'rose';
export interface Clip {
  id: string;
  content: string;
  kind: Kind;
  title: string;
  favorite: boolean;
  categoryId: string | null;
  createdAt: number;
  updatedAt: number;
  copyCount: number;
}
export interface Category {
  id: string;
  name: string;
  color: Color;
}
export interface Settings {
  paused: boolean;
  onboardingComplete: boolean;
  theme: 'system' | 'light' | 'dark';
  historyLimit: number;
  retentionDays: number;
  maxTextBytes: number;
  filterSensitive: boolean;
  ignoredPhrases: string[];
  startMinimized: boolean;
  closeToTray: boolean;
}
export interface Snapshot {
  clips: Clip[];
  categories: Category[];
  settings: Settings;
  captureError: string | null;
}
export type View = 'all' | 'favorites' | 'uncategorized' | 'settings' | `category:${string}`;
export const defaults: Settings = {
  paused: true,
  onboardingComplete: false,
  theme: 'system',
  historyLimit: 500,
  retentionDays: 30,
  maxTextBytes: 100000,
  filterSensitive: true,
  ignoredPhrases: [],
  startMinimized: false,
  closeToTray: true,
};
