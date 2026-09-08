"use client";

import { useDroppable } from "@dnd-kit/core";
import { Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

export const TRASH_ZONE_ID = "trash-zone";

export function TrashDropZone({ visible }: { visible: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: TRASH_ZONE_ID });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "fixed bottom-8 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border px-5 py-3 text-sm font-medium transition-all duration-200",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        isOver
          ? "card-shadow-lifted scale-110 border-destructive bg-destructive text-destructive-foreground"
          : "card-shadow border-border/60 bg-card text-muted-foreground"
      )}
    >
      <Trash2 className="size-4" />
      {isOver ? "Release to delete" : "Drag here to delete"}
    </div>
  );
}
