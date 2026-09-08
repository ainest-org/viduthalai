"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { ArrowLeft, MoreHorizontal, Plus } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { BoardDetail, Card, CardLink, Column, Priority } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addRecentBoard } from "@/lib/board-prefs";
import { KanbanColumn } from "@/components/kanban/column";
import { CardPreview } from "@/components/kanban/sortable-card";
import { CardDialog, type CardDialogState } from "@/components/kanban/card-dialog";
import { TRASH_ZONE_ID, TrashDropZone } from "@/components/kanban/trash-drop-zone";

const CARD_PREFIX = "card-";
const COLUMN_PREFIX = "col-";
const UNDO_DELETE_MS = 5000;

function isCardId(id: string): boolean {
  return id.startsWith(CARD_PREFIX);
}

function isColumnId(id: string): boolean {
  return id.startsWith(COLUMN_PREFIX);
}

function idFrom(id: string, prefix: string): number {
  return Number(id.slice(prefix.length));
}

function editDialogState(card: Card): CardDialogState {
  return {
    mode: "edit",
    columnId: card.column_id,
    cardId: card.id,
    title: card.title,
    description: card.description ?? "",
    dueDate: card.due_date,
    priority: card.priority,
  };
}

export function BoardView({ boardId }: { boardId: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [cardDialog, setCardDialog] = useState<CardDialogState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [focusedCardId, setFocusedCardId] = useState<number | null>(null);

  const pendingDeletes = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const autoOpenedCardRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  useEffect(() => {
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  useEffect(() => {
    if (autoOpenedCardRef.current) return;
    const cardIdParam = searchParams.get("card");
    if (!cardIdParam) return;
    const cardId = Number(cardIdParam);
    const card = columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
    if (!card) return;
    autoOpenedCardRef.current = true;
    setCardDialog(editDialogState(card));
    router.replace(`/boards/${boardId}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, searchParams]);

  function loadBoard() {
    api
      .getBoard(boardId)
      .then((data) => {
        setBoard(data);
        setColumns(data.columns);
        addRecentBoard(boardId);
      })
      .catch((err) => {
        toast.error(err instanceof ApiError ? err.message : "Failed to load board");
        if (err instanceof ApiError && err.status === 404) router.replace("/dashboard");
      });
  }

  async function handleAddColumn(e: FormEvent) {
    e.preventDefault();
    const trimmed = newColumnName.trim();
    if (!trimmed) return;
    try {
      const column = await api.createColumn(boardId, trimmed);
      setColumns((prev) => [...prev, { ...column, cards: [] }]);
      setNewColumnName("");
      setAddingColumn(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create column");
    }
  }

  async function handleRenameColumn(columnId: number, name: string) {
    const previous = columns;
    setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, name } : c)));
    try {
      await api.updateColumn(columnId, { name });
    } catch (err) {
      setColumns(previous);
      toast.error(err instanceof ApiError ? err.message : "Failed to rename column");
    }
  }

  async function handleDeleteColumn(columnId: number) {
    if (!window.confirm("Delete this column and all its cards?")) return;
    const previous = columns;
    setColumns((prev) => prev.filter((c) => c.id !== columnId));
    try {
      await api.deleteColumn(columnId);
    } catch (err) {
      setColumns(previous);
      toast.error(err instanceof ApiError ? err.message : "Failed to delete column");
    }
  }

  function handleDeleteCard(card: Card) {
    const sourceColumn = columns.find((c) => c.cards.some((existing) => existing.id === card.id));
    if (!sourceColumn) return;
    const sourceIndex = sourceColumn.cards.findIndex((existing) => existing.id === card.id);

    setColumns((prev) =>
      prev.map((c) => ({ ...c, cards: c.cards.filter((existing) => existing.id !== card.id) }))
    );
    if (focusedCardId === card.id) setFocusedCardId(null);

    const timer = setTimeout(async () => {
      pendingDeletes.current.delete(card.id);
      try {
        await api.deleteCard(card.id);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Failed to delete card");
        loadBoard();
      }
    }, UNDO_DELETE_MS);
    pendingDeletes.current.set(card.id, timer);

    toast(`Deleted "${card.title}"`, {
      duration: UNDO_DELETE_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const pending = pendingDeletes.current.get(card.id);
          if (pending) {
            clearTimeout(pending);
            pendingDeletes.current.delete(card.id);
          }
          setColumns((prev) => {
            const next = prev.map((c) => ({ ...c, cards: [...c.cards] }));
            const target = next.find((c) => c.id === sourceColumn.id);
            if (target) {
              const insertAt = Math.min(sourceIndex, target.cards.length);
              target.cards.splice(insertAt, 0, card);
            }
            return next;
          });
        },
      },
    });
  }

  async function handleDuplicateCard(card: Card) {
    try {
      const duplicate = await api.createCard(card.column_id, {
        title: `${card.title} (copy)`,
        description: card.description ?? undefined,
        due_date: card.due_date,
        priority: card.priority,
      });
      setColumns((prev) =>
        prev.map((c) => (c.id === card.column_id ? { ...c, cards: [...c.cards, duplicate] } : c))
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to duplicate card");
    }
  }

  async function handleRenameCardTitle(card: Card, title: string) {
    const previous = columns;
    setColumns((prev) =>
      prev.map((c) => ({
        ...c,
        cards: c.cards.map((existing) => (existing.id === card.id ? { ...existing, title } : existing)),
      }))
    );
    try {
      await api.updateCard(card.id, { title });
    } catch (err) {
      setColumns(previous);
      toast.error(err instanceof ApiError ? err.message : "Failed to rename card");
    }
  }

  async function handleSetCardPriority(card: Card, priority: Priority | null) {
    const previous = columns;
    setColumns((prev) =>
      prev.map((c) => ({
        ...c,
        cards: c.cards.map((existing) => (existing.id === card.id ? { ...existing, priority } : existing)),
      }))
    );
    try {
      await api.updateCard(card.id, { priority });
    } catch (err) {
      setColumns(previous);
      toast.error(err instanceof ApiError ? err.message : "Failed to set priority");
    }
  }

  async function moveCard(cardId: number, destColumnId: number, destIndex: number) {
    const sourceColumn = columns.find((c) => c.cards.some((card) => card.id === cardId));
    if (!sourceColumn) return;

    const newColumns = columns.map((c) => ({ ...c, cards: [...c.cards] }));
    const newSource = newColumns.find((c) => c.id === sourceColumn.id)!;
    const newDest = newColumns.find((c) => c.id === destColumnId)!;

    const sourceIndex = newSource.cards.findIndex((c) => c.id === cardId);
    const [movingCard] = newSource.cards.splice(sourceIndex, 1);

    const isSameColumn = newSource.id === newDest.id;
    const insertIndex = isSameColumn && sourceIndex < destIndex ? destIndex - 1 : destIndex;
    newDest.cards.splice(insertIndex, 0, { ...movingCard, column_id: newDest.id });

    const updates: { id: number; position: number; column_id?: number }[] = [];

    newSource.cards.forEach((c, idx) => {
      if (c.position !== idx) updates.push({ id: c.id, position: idx });
      c.position = idx;
    });

    if (!isSameColumn) {
      newDest.cards.forEach((c, idx) => {
        const isMovedCard = c.id === movingCard.id;
        if (c.position !== idx || isMovedCard) {
          updates.push({
            id: c.id,
            position: idx,
            column_id: isMovedCard ? newDest.id : undefined,
          });
        }
        c.position = idx;
      });
    }

    const previous = columns;
    setColumns(newColumns);

    try {
      await Promise.all(
        updates.map((u) => api.updateCard(u.id, { position: u.position, column_id: u.column_id }))
      );
    } catch (err) {
      setColumns(previous);
      toast.error(err instanceof ApiError ? err.message : "Failed to move card");
    }
  }

  function handleCardLinksChange(cardId: number, links: CardLink[]) {
    setColumns((prev) =>
      prev.map((c) => ({
        ...c,
        cards: c.cards.map((card) => (card.id === cardId ? { ...card, links } : card)),
      }))
    );
  }

  function handleMoveCardToColumn(card: Card, columnId: number) {
    const destColumn = columns.find((c) => c.id === columnId);
    if (!destColumn) return;
    moveCard(card.id, columnId, destColumn.cards.length);
  }

  async function handleCardDialogSubmit(values: {
    title: string;
    description: string;
    dueDate: string | null;
    priority: Priority | null;
  }) {
    if (!cardDialog) return;
    setSubmitting(true);
    try {
      if (cardDialog.mode === "add") {
        const card = await api.createCard(cardDialog.columnId, {
          title: values.title,
          description: values.description,
          due_date: values.dueDate,
          priority: values.priority,
        });
        setColumns((prev) =>
          prev.map((c) => (c.id === cardDialog.columnId ? { ...c, cards: [...c.cards, card] } : c))
        );
      } else if (cardDialog.cardId) {
        const updated = await api.updateCard(cardDialog.cardId, {
          title: values.title,
          description: values.description || null,
          due_date: values.dueDate,
          priority: values.priority,
        });
        setColumns((prev) =>
          prev.map((c) => ({
            ...c,
            cards: c.cards.map((card) => (card.id === updated.id ? updated : card)),
          }))
        );
      }
      setCardDialog(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save card");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (!isCardId(id)) return;
    const cardId = idFrom(id, CARD_PREFIX);
    const card = columns.flatMap((c) => c.cards).find((c) => c.id === cardId) ?? null;
    setActiveCard(card);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;

    const activeId = String(active.id);
    if (!isCardId(activeId)) return;
    const cardId = idFrom(activeId, CARD_PREFIX);

    if (over.id === TRASH_ZONE_ID) {
      const card = columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
      if (card) handleDeleteCard(card);
      return;
    }

    const overId = String(over.id);
    let destColumnId: number;
    let destIndex: number;

    if (isCardId(overId)) {
      const overCardId = idFrom(overId, CARD_PREFIX);
      if (overCardId === cardId) return;
      const destColumn = columns.find((c) => c.cards.some((card) => card.id === overCardId));
      if (!destColumn) return;
      destColumnId = destColumn.id;
      destIndex = destColumn.cards.findIndex((card) => card.id === overCardId);
    } else if (isColumnId(overId)) {
      destColumnId = idFrom(overId, COLUMN_PREFIX);
      const destColumn = columns.find((c) => c.id === destColumnId);
      if (!destColumn) return;
      destIndex = destColumn.cards.length;
    } else {
      return;
    }

    await moveCard(cardId, destColumnId, destIndex);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (cardDialog !== null) return;

      const focusedCard = columns.flatMap((c) => c.cards).find((c) => c.id === focusedCardId) ?? null;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!focusedCard) {
          const firstWithCards = columns.find((c) => c.cards.length > 0);
          if (firstWithCards) setFocusedCardId(firstWithCards.cards[0].id);
          return;
        }
        const col = columns.find((c) => c.id === focusedCard.column_id);
        if (!col) return;
        const idx = col.cards.findIndex((c) => c.id === focusedCard.id);
        const nextIdx = e.key === "ArrowDown" ? idx + 1 : idx - 1;
        if (nextIdx >= 0 && nextIdx < col.cards.length) setFocusedCardId(col.cards[nextIdx].id);
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (!focusedCard) return;
        e.preventDefault();
        const colIdx = columns.findIndex((c) => c.id === focusedCard.column_id);
        const nextColIdx = e.key === "ArrowRight" ? colIdx + 1 : colIdx - 1;
        if (nextColIdx < 0 || nextColIdx >= columns.length) return;
        const nextCol = columns[nextColIdx];
        if (nextCol.cards.length === 0) return;
        const curIdx = columns[colIdx].cards.findIndex((c) => c.id === focusedCard.id);
        const clampedIdx = Math.min(curIdx, nextCol.cards.length - 1);
        setFocusedCardId(nextCol.cards[clampedIdx].id);
        return;
      }

      if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        const targetColumnId = focusedCard?.column_id ?? columns[0]?.id;
        if (targetColumnId) {
          setCardDialog({
            mode: "add",
            columnId: targetColumnId,
            title: "",
            description: "",
            dueDate: null,
            priority: null,
          });
        }
        return;
      }

      if (!focusedCard) return;

      if (e.key === "Enter") {
        e.preventDefault();
        setCardDialog(editDialogState(focusedCard));
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteCard(focusedCard);
        return;
      }

      if (e.key === "1") {
        e.preventDefault();
        handleSetCardPriority(focusedCard, "low");
        return;
      }
      if (e.key === "2") {
        e.preventDefault();
        handleSetCardPriority(focusedCard, "medium");
        return;
      }
      if (e.key === "3") {
        e.preventDefault();
        handleSetCardPriority(focusedCard, "high");
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        handleSetCardPriority(focusedCard, null);
        return;
      }

      if (e.key === "Escape") {
        setFocusedCardId(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, focusedCardId, cardDialog]);

  if (!board) {
    return (
      <div className="flex gap-4 px-4 py-6 sm:px-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-96 w-[300px] rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{board.name}</h1>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-lg">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                if (!window.confirm("Delete this board and everything in it?")) return;
                try {
                  await api.deleteBoard(boardId);
                  router.push("/dashboard");
                } catch (err) {
                  toast.error(err instanceof ApiError ? err.message : "Failed to delete board");
                }
              }}
            >
              Delete board
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="scroll-thin flex items-start gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              otherColumns={columns
                .filter((c) => c.id !== column.id)
                .map((c) => ({ id: c.id, name: c.name }))}
              focusedCardId={focusedCardId}
              onAddCard={(columnId) =>
                setCardDialog({
                  mode: "add",
                  columnId,
                  title: "",
                  description: "",
                  dueDate: null,
                  priority: null,
                })
              }
              onEditCard={(card) => setCardDialog(editDialogState(card))}
              onDeleteCard={handleDeleteCard}
              onDuplicateCard={handleDuplicateCard}
              onRenameCardTitle={handleRenameCardTitle}
              onSetCardPriority={handleSetCardPriority}
              onMoveCardToColumn={handleMoveCardToColumn}
              onRenameColumn={handleRenameColumn}
              onDeleteColumn={handleDeleteColumn}
            />
          ))}

          <div className="w-[300px] shrink-0">
            {addingColumn ? (
              <form
                onSubmit={handleAddColumn}
                className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-panel p-2.5 panel-shadow"
              >
                <Input
                  autoFocus
                  placeholder="Column name"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onBlur={() => {
                    if (!newColumnName.trim()) setAddingColumn(false);
                  }}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" className="rounded-lg">
                    Add column
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => {
                      setAddingColumn(false);
                      setNewColumnName("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button
                variant="ghost"
                className="w-full justify-start rounded-2xl border border-dashed border-border text-muted-foreground hover:border-solid hover:text-foreground"
                onClick={() => setAddingColumn(true)}
              >
                <Plus />
                Add column
              </Button>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeCard ? <CardPreview card={activeCard} lifted /> : null}
        </DragOverlay>

        <TrashDropZone visible={activeCard !== null} />
      </DndContext>

      <CardDialog
        state={cardDialog}
        onClose={() => setCardDialog(null)}
        onSubmit={handleCardDialogSubmit}
        submitting={submitting}
        onLinksChange={handleCardLinksChange}
      />
    </div>
  );
}
