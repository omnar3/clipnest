import { defaults, type Snapshot, type Clip, type Settings, type Color } from './types';
const time = Date.now();
const examples: [string, Clip['kind'], string, string | null, boolean][] = [
  ['A quieter place for everything you copy.', 'text', 'A little inspiration', 'ideas', true],
  [
    'const createSomethingGood = () => {\n  return { curiosity: true, distractions: false };\n};',
    'code',
    'A fresh start',
    'dev',
    true,
  ],
  [
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    'link',
    'JavaScript reference',
    'dev',
    false,
  ],
  [
    'Project notes\n\n• Keep the interface simple\n• Make the useful things easy to find\n• Leave a little room to breathe',
    'text',
    'Design principles',
    'work',
    false,
  ],
  [
    '{\n  "name": "ClipNest",\n  "storage": "local",\n  "madeBy": "Narayan Om"\n}',
    'code',
    'Project configuration',
    'dev',
    false,
  ],
  ['https://www.figma.com/community', 'link', 'A spark for the next project', 'ideas', true],
  [
    'Hey! The updated designs are ready for review. Let me know what you think when you have a moment.',
    'text',
    'Review request',
    'work',
    false,
  ],
  ['Good tools get out of your way.', 'text', '', null, false],
];
export function initialDemo(): Snapshot {
  return {
    settings: { ...defaults, onboardingComplete: true, paused: true, theme: 'dark' },
    captureError: null,
    categories: [
      { id: 'work', name: 'Work', color: 'blue' },
      { id: 'dev', name: 'Development', color: 'mint' },
      { id: 'ideas', name: 'Ideas', color: 'violet' },
    ],
    clips: examples.map(([content, kind, title, categoryId, favorite], i) => ({
      id: `demo-${i}`,
      content,
      kind,
      title,
      categoryId,
      favorite,
      createdAt: time - i * 3600000,
      updatedAt: time - i * 1700000,
      copyCount: i % 4,
    })),
  };
}
let state = initialDemo();
export async function demoCommand<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  switch (command) {
    case 'get_snapshot':
      return structuredClone(state) as T;
    case 'save_settings':
      state.settings = structuredClone(args.settings as Settings);
      break;
    case 'update_clip': {
      const c = state.clips.find((c) => c.id === args.id);
      if (c)
        Object.assign(c, {
          favorite: args.favorite,
          categoryId: args.categoryId,
          title: args.title,
        });
      break;
    }
    case 'copy_clip': {
      const c = state.clips.find((c) => c.id === args.id);
      if (c) {
        await navigator.clipboard.writeText(c.content);
        c.copyCount++;
      }
      break;
    }
    case 'delete_clips':
      state.clips = state.clips.filter((c) => !(args.ids as string[]).includes(c.id));
      break;
    case 'clear_history':
      state.clips = state.clips.filter((c) => !args.includeFavorites && c.favorite);
      break;
    case 'save_category': {
      const name = String(args.name).trim();
      if (!name) throw Error('Choose a category name.');
      if (
        state.categories.some(
          (c) => c.id !== args.id && c.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw Error('This category already exists.');
      if (args.id) {
        const c = state.categories.find((c) => c.id === args.id);
        if (c) Object.assign(c, { name, color: args.color });
      } else state.categories.push({ id: crypto.randomUUID(), name, color: args.color as Color });
      break;
    }
    case 'delete_category':
      state.categories = state.categories.filter((c) => c.id !== args.id);
      state.clips.forEach((c) => {
        if (c.categoryId === args.id) c.categoryId = null;
      });
      break;
    case 'reset_demo':
      state = initialDemo();
      break;
    default:
      throw Error('This feature is available in the desktop app.');
  }
  window.dispatchEvent(new Event('clipnest-demo'));
  return undefined as T;
}
