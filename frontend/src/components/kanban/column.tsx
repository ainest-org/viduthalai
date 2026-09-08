"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { MoreHorizontal, Plus } from "lucide-react";

import type { Card, Column, Priority } from "@/lib/types";
import { cn } from "@/lib/utils";
import { dotColorForStatus } from "@/lib/status-colors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SortableCard } from "@/components/kanban/sortable-card";

interface KanbanColumnProps {
  column: Column;
  otherColumns: { id: number; name: string }[];
  focusedCardId: number | null;
  onAddCard: (columnId: number) => void;
  onEditCard: (card: Card) => void;
  onDeleteCard: (card: Card) => void;
  onDuplicateCard: (card: Card) => void;
  onRenameCardTitle: (card: Card, title: string) => void;
  onSetCardPriority: (card: Card, priority: Priority | null) => void;
  onMoveCardToColumn: (card: Card, columnId: number) => void;
  onRenameColumn: (columnId: number, name: string) => void;
  onDeleteColumn: (columnId: number) => void;
}

export function KanbanColumn({
  column,
  otherColumns,
  focusedCardId,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onDuplicateCard,
  onRenameCardTitle,
  onSetCardPriority,
  onMoveCardToColumn,
  onRenameColumn,
  onDeleteColumn,
}: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id: `col-${column.id}`,
    data: { type: "column", columnId: column.id },
  });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);

  function saveName() {
    setEditing(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== column.name) {
      onRenameColumn(column.id, trimmed);
    } else {
      setName(column.name);
    }
  }

  const cardIds = column.cards.map((card) => `card-${card.id}`);
  const dotColor = dotColorForStatus(column.name);

  return (
    <div className="flex w-[300px] shrink-0 flex-col rounded-2xl border border-border/60 bg-panel p-2.5 panel-shadow">
      <div className="flex items-center justify-between gap-2 px-1.5 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("size-2 shrink-0 rounded-full", dotColor)} />
          {editing ? (
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setName(column.name);
                  setEditing(false);
                }
              }}
              className="h-7 px-2 text-[15px] font-semibold"
            />
          ) : (
            <h3
              className="cursor-text truncate text-[15px] font-semibold tracking-tight"
              onClick={() => setEditing(true)}
            >
              {column.name}
            </h3>
          )}
          <span className="text-sm text-muted-foreground">{column.cards.length}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7 shrink-0 rounded-lg">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDeleteColumn(column.id)}>
              Delete column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div ref={setNodeRef} className="flex min-h-16 flex-col gap-2.5 p-1">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {column.cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              otherColumns={otherColumns}
              focused={focusedCardId === card.id}
              onEdit={() => onEditCard(card)}
              onDelete={() => onDeleteCard(card)}
              onDuplicate={() => onDuplicateCard(card)}
              onRenameTitle={(title) => onRenameCardTitle(card, title)}
              onSetPriority={(priority) => onSetCardPriority(card, priority)}
              onMoveToColumn={(columnId) => onMoveCardToColumn(card, columnId)}
            />
          ))}
        </SortableContext>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="mt-0.5 justify-start rounded-lg text-muted-foreground hover:text-foreground"
        onClick={() => onAddCard(column.id)}
      >
        <Plus />
        Add card
      </Button>
    </div>
  );
}
