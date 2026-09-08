"use client";

import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Pin, Plus } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Board, CardWithContext } from "@/lib/types";
import { dotColorForStatus } from "@/lib/status-colors";
import { getPinnedBoardIds, getRecentBoardIds, togglePinnedBoard } from "@/lib/board-prefs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [cards, setCards] = useState<CardWithContext[] | null>(null);
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const [recentIds, setRecentIds] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([api.listBoards(), api.listMyCards()])
      .then(([boardsRes, cardsRes]) => {
        setBoards(boardsRes);
        setCards(cardsRes);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load dashboard"));
    setPinnedIds(getPinnedBoardIds());
    setRecentIds(getRecentBoardIds());
  }, []);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setOpen(true);
      router.replace("/dashboard", { scroll: false });
    }
  }, [searchParams, router]);

  const countsByBoard = useMemo(() => {
    const map = new Map<number, Map<string, number>>();
    for (const card of cards ?? []) {
      const boardCounts = map.get(card.board_id) ?? new Map<string, number>();
      boardCounts.set(card.column_name, (boardCounts.get(card.column_name) ?? 0) + 1);
      map.set(card.board_id, boardCounts);
    }
    return map;
  }, [cards]);

  const orderedBoards = useMemo(() => {
    if (!boards) return [];
    const pinnedSet = new Set(pinnedIds);
    const pinned = boards.filter((b) => pinnedSet.has(b.id));
    const rest = boards.filter((b) => !pinnedSet.has(b.id));
    return [...pinned, ...rest];
  }, [boards, pinnedIds]);

  const recentBoards = useMemo(() => {
    if (!boards) return [];
    const pinnedSet = new Set(pinnedIds);
    const byId = new Map(boards.map((b) => [b.id, b]));
    return recentIds
      .filter((id) => !pinnedSet.has(id))
      .map((id) => byId.get(id))
      .filter((b): b is Board => Boolean(b));
  }, [boards, recentIds, pinnedIds]);

  function handleTogglePin(e: MouseEvent, boardId: number) {
    e.preventDefault();
    e.stopPropagation();
    setPinnedIds(togglePinnedBoard(boardId));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const board = await api.createBoard({ name: name.trim() });
      setBoards((prev) => [...(prev ?? []), board]);
      setName("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create board");
    } finally {
      setCreating(false);
    }
  }

  const loading = boards === null || cards === null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">All your boards, at a glance</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full px-4">
              <Plus />
              New board
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a new board</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <Input
                autoFocus
                placeholder="Board name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <DialogFooter>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create board"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No boards yet. Create your first one to get started.
        </p>
      ) : (
        <>
          {recentBoards.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Recently viewed
              </h2>
              <div className="scroll-thin flex gap-3 overflow-x-auto pb-1">
                {recentBoards.map((board) => (
                  <Link
                    key={board.id}
                    href={`/boards/${board.id}`}
                    className="shrink-0 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm font-medium card-shadow card-shadow-hover transition-shadow duration-200"
                  >
                    {board.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {orderedBoards.map((board) => {
              const statusCounts = Array.from(countsByBoard.get(board.id)?.entries() ?? []);
              const totalCards = statusCounts.reduce((sum, [, count]) => sum + count, 0);
              const pinned = pinnedIds.includes(board.id);

              return (
                <Link
                  key={board.id}
                  href={`/boards/${board.id}`}
                  className="block rounded-2xl border border-border/60 bg-card p-5 card-shadow card-shadow-hover transition-shadow duration-200"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-[15px] font-semibold tracking-tight">{board.name}</h2>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => handleTogglePin(e, board.id)}
                        aria-label={pinned ? "Unpin board" : "Pin board"}
                        className={cn(
                          "rounded-md p-1 transition-colors hover:bg-accent",
                          pinned ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        <Pin className={cn("size-3.5", pinned && "fill-current")} />
                      </button>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {totalCards} card{totalCards === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  {statusCounts.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                      {statusCounts.map(([status, count]) => (
                        <div key={status} className="flex items-center gap-1.5 text-sm">
                          <span
                            className={cn("size-2 shrink-0 rounded-full", dotColorForStatus(status))}
                          />
                          <span className="font-medium text-foreground">{count}</span>
                          <span className="text-muted-foreground">{status}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">No cards yet</p>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
