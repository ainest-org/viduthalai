"use client";

import { useRef, useState, type MouseEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, Trash2 } from "lucide-react";

import type { Card, Priority } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CardMeta, PRIORITY_META, PRIORITY_OPTIONS } from "@/components/kanban/card-meta";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface CardPreviewProps {
  card: Card;
  onEdit?: () => void;
  onDelete?: () => void;
  dragging?: boolean;
  lifted?: boolean;
  focused?: boolean;
  editingTitle?: boolean;
  onTitleClick?: (e: MouseEvent) => void;
  onTitleCommit?: (title: string) => void;
}

export function CardPreview({
  card,
  onEdit,
  onDelete,
  dragging,
  lifted,
  focused,
  editingTitle,
  onTitleClick,
  onTitleCommit,
}: CardPreviewProps) {
  return (
    <div
      onClick={onEdit}
      className={cn(
        "group cursor-grab touch-none rounded-xl border border-border/60 bg-card p-3.5 card-shadow card-shadow-hover transition-shadow duration-200 select-none active:cursor-grabbing",
        dragging && "opacity-40",
        lifted && "card-shadow-lifted rotate-2",
        focused && "ring-2 ring-ring ring-offset-2 ring-offset-background"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {editingTitle ? (
          <input
            autoFocus
            defaultValue={card.title}
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => onTitleCommit?.(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onTitleCommit?.(e.currentTarget.value);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onTitleCommit?.(card.title);
              }
            }}
            className="w-full rounded border border-ring bg-transparent px-1 -mx-1 text-[14px] leading-snug font-medium text-foreground outline-none"
          />
        ) : (
          <p
            onClick={onTitleClick}
            className="text-[14px] leading-snug font-medium text-foreground"
          >
            {card.title}
          </p>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="-mt-0.5 -mr-0.5 shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      {card.description && (
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          {card.description}
        </p>
      )}
      <CardMeta card={card} />
    </div>
  );
}

interface SortableCardProps {
  card: Card;
  otherColumns: { id: number; name: string }[];
  focused?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRenameTitle: (title: string) => void;
  onSetPriority: (priority: Priority | null) => void;
  onMoveToColumn: (columnId: number) => void;
}

export function SortableCard({
  card,
  otherColumns,
  focused,
  onEdit,
  onDelete,
  onDuplicate,
  onRenameTitle,
  onSetPriority,
  onMoveToColumn,
}: SortableCardProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const titleCommittedRef = useRef(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card-${card.id}`,
    data: { type: "card", columnId: card.column_id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          data-card-id={card.id}
        >
          <CardPreview
            card={card}
            onEdit={onEdit}
            onDelete={onDelete}
            dragging={isDragging}
            focused={focused}
            editingTitle={editingTitle}
            onTitleClick={(e) => {
              e.stopPropagation();
              titleCommittedRef.current = false;
              setEditingTitle(true);
            }}
            onTitleCommit={(title) => {
              if (titleCommittedRef.current) return;
              titleCommittedRef.current = true;
              setEditingTitle(false);
              const trimmed = title.trim();
              if (trimmed && trimmed !== card.title) onRenameTitle(trimmed);
            }}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onEdit}>Open card</ContextMenuItem>
        {otherColumns.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {otherColumns.map((col) => (
                <ContextMenuItem key={col.id} onClick={() => onMoveToColumn(col.id)}>
                  {col.name}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuSub>
          <ContextMenuSubTrigger>Priority</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => onSetPriority(null)}>None</ContextMenuItem>
            {PRIORITY_OPTIONS.map((option) => (
              <ContextMenuItem key={option} onClick={() => onSetPriority(option)}>
                <span className={cn("size-2 shrink-0 rounded-full", PRIORITY_META[option].dot)} />
                {PRIORITY_META[option].label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onClick={onDuplicate}>
          <Copy />
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
