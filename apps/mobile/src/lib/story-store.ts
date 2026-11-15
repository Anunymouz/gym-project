import type { StoryGroup, StoryTray } from '@bgym/shared';

/**
 * The story tray last loaded on Home, shared with the full-screen viewer (so opening a story is
 * instant) and updated as stories are watched (rings turn grey without a reload).
 */
let tray: StoryTray | null = null;
const listeners = new Set<(t: StoryTray | null) => void>();

export const storyStore = {
  get: () => tray,
  set(next: StoryTray | null) {
    tray = next;
    for (const l of listeners) l(tray);
  },
  subscribe(fn: (t: StoryTray | null) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  markSeen(storyId: string) {
    if (!tray) return;
    const groups: StoryGroup[] = tray.groups.map((g) => {
      if (!g.stories.some((s) => s.id === storyId && !s.seen)) return g;
      const stories = g.stories.map((s) => (s.id === storyId ? { ...s, seen: true } : s));
      return { ...g, stories, allSeen: stories.every((s) => s.seen) };
    });
    storyStore.set({ ...tray, groups });
  },
  update(storyId: string, patch: { likedByMe?: boolean }) {
    if (!tray) return;
    storyStore.set({ ...tray, groups: tray.groups.map((g) => ({ ...g, stories: g.stories.map((s) => (s.id === storyId ? { ...s, ...patch } : s)) })) });
  },
  remove(storyId: string) {
    if (!tray) return;
    storyStore.set({ ...tray, groups: tray.groups.map((g) => ({ ...g, stories: g.stories.filter((s) => s.id !== storyId) })).filter((g) => g.stories.length > 0) });
  },
  removeAuthor(userId: string) {
    if (!tray) return;
    storyStore.set({ ...tray, groups: tray.groups.filter((g) => !(g.author.kind === 'member' && g.author.id === userId)) });
  },
};
