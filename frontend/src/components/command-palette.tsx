"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarClock, LayoutDashboard, Moon, Plus, Sun, Trello, Users } from "lucide-react";

import { api } from "@/lib/api";
import type { Board, CardWithContext } from "@/lib/types";
import { useTheme } from "@/lib/theme-context";
import { useCommandPalette } from "@/lib/command-palette-context";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [boards, setBoards] = useState<Board[]>([]);
  const [cards, setCards] = useState<CardWithContext[]>([]);
  const loadedRef = useRef(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  useEffect(() => {
    if (open && !loadedRef.current) {
      loadedRef.current = true;
      Promise.all([api.listBoards(), api.listMyCards()])
        .then(([b, c]) => {
          setBoards(b);
          setCards(c);
        })
        .catch(() => {
          loadedRef.current = false;
        });
    }
  }, [open]);

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search boards, cards, or run a command..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem value="create new board" onSelect={() => go("/dashboard?new=1")}>
            <Plus />
            Create new board
          </CommandItem>
          <CommandItem value="go to dashboard" onSelect={() => go("/dashboard")}>
            <LayoutDashboard />
            Go to Dashboard
          </CommandItem>
          <CommandItem value="go to my work today" onSelect={() => go("/today")}>
            <CalendarClock />
            Go to My work today
          </CommandItem>
          <CommandItem value="go to team pm overview" onSelect={() => go("/team")}>
            <Users />
            Go to Team
          </CommandItem>
          <CommandItem value="go to organizations" onSelect={() => go("/organizations")}>
            <Building2 />
            Go to Organizations
          </CommandItem>
          <CommandItem
            value="toggle dark mode light mode theme"
            onSelect={() => {
              setOpen(false);
              toggleTheme();
            }}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
            Toggle {theme === "dark" ? "light" : "dark"} mode
          </CommandItem>
        </CommandGroup>

        {boards.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Boards">
              {boards.map((board) => (
                <CommandItem
                  key={`board-${board.id}`}
                  value={`board ${board.name}`}
                  onSelect={() => go(`/boards/${board.id}`)}
                >
                  <Trello />
                  {board.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {cards.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Cards">
              {cards.map((card) => (
                <CommandItem
                  key={`card-${card.id}`}
                  value={`card ${card.title} ${card.board_name} ${card.column_name}`}
                  onSelect={() => go(`/boards/${card.board_id}?card=${card.id}`)}
                >
                  <span className="min-w-0 flex-1 truncate">{card.title}</span>
                  <span className="shrink-0 truncate text-xs text-muted-foreground">
                    {card.board_name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
