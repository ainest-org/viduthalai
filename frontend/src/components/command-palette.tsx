"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarClock, FolderGit2, LayoutDashboard, Moon, Sun } from "lucide-react";

import { api } from "@/lib/api";
import type { DashboardProject } from "@/lib/types";
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
  const [projects, setProjects] = useState<DashboardProject[]>([]);
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
      api.getDashboardProjects().then(setProjects).catch(() => {
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
      <CommandInput placeholder="Search projects, or run a command..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem value="go to dashboard" onSelect={() => go("/dashboard")}>
            <LayoutDashboard />
            Go to Dashboard
          </CommandItem>
          <CommandItem value="go to my work today" onSelect={() => go("/today")}>
            <CalendarClock />
            Go to My work today
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

        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {projects.map((project) => (
                <CommandItem
                  key={`project-${project.id}`}
                  value={`project ${project.name} ${project.org_name}`}
                  onSelect={() => go(`/organizations/${project.org_id}/projects/${project.id}`)}
                >
                  <FolderGit2 />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <span className="shrink-0 truncate text-xs text-muted-foreground">
                    {project.org_name}
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
