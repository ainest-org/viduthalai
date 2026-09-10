"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const POLL_MS = 30_000;

function formatRelative(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  function refreshCount() {
    api
      .getUnreadNotificationCount()
      .then((res) => setUnreadCount(res.count))
      .catch(() => {});
  }

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      api
        .listNotifications()
        .then(setNotifications)
        .catch((err) => {
          if (!(err instanceof ApiError)) console.error(err);
        });
    }
  }

  async function handleNotificationClick(notification: Notification) {
    if (!notification.read) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      api.markNotificationRead(notification.id).catch(() => {});
    }
    setOpen(false);
    if (notification.link) router.push(notification.link);
  }

  async function handleMarkAllRead() {
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await api.markAllNotificationsRead();
    } catch {
      refreshCount();
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger className="relative flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground">
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <p className="text-sm font-medium">Notifications</p>
          {notifications.some((n) => !n.read) && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          <div className="scroll-thin flex max-h-80 flex-col overflow-y-auto">
            {notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className="flex flex-col items-start gap-0.5 whitespace-normal"
              >
                <div className="flex w-full items-start gap-2">
                  {!notification.read && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />}
                  <p className={cn("flex-1 text-sm", notification.read && "text-muted-foreground")}>
                    {notification.message}
                  </p>
                </div>
                <span className="pl-3.5 text-xs text-muted-foreground">
                  {formatRelative(notification.created_at)}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
