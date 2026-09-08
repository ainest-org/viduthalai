const RECENT_KEY = "viduthalai_recent_boards";
const PINNED_KEY = "viduthalai_pinned_boards";
const MAX_RECENT = 5;

function readIds(key: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: number[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — ignore
  }
}

export function getRecentBoardIds(): number[] {
  return readIds(RECENT_KEY);
}

export function addRecentBoard(boardId: number): void {
  const ids = readIds(RECENT_KEY).filter((id) => id !== boardId);
  ids.unshift(boardId);
  writeIds(RECENT_KEY, ids.slice(0, MAX_RECENT));
}

export function getPinnedBoardIds(): number[] {
  return readIds(PINNED_KEY);
}

export function togglePinnedBoard(boardId: number): number[] {
  const ids = readIds(PINNED_KEY);
  const next = ids.includes(boardId) ? ids.filter((id) => id !== boardId) : [...ids, boardId];
  writeIds(PINNED_KEY, next);
  return next;
}
