"use client";

import { useEffect, useState, type FormEvent } from "react";
import { GitMerge, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import type { CardLink, Priority } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MR_STATE_META, PRIORITY_META, PRIORITY_OPTIONS } from "@/components/kanban/card-meta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface CardDialogState {
  mode: "add" | "edit";
  columnId: number;
  cardId?: number;
  title: string;
  description: string;
  dueDate: string | null;
  priority: Priority | null;
}

interface CardDialogProps {
  state: CardDialogState | null;
  onClose: () => void;
  onSubmit: (values: {
    title: string;
    description: string;
    dueDate: string | null;
    priority: Priority | null;
  }) => void;
  submitting: boolean;
  onLinksChange?: (cardId: number, links: CardLink[]) => void;
}

export function CardDialog({ state, onClose, onSubmit, submitting, onLinksChange }: CardDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority | null>(null);

  const [links, setLinks] = useState<CardLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [mrUrl, setMrUrl] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (state) {
      setTitle(state.title);
      setDescription(state.description);
      setDueDate(state.dueDate);
      setPriority(state.priority);
    }

    if (state?.mode === "edit" && state.cardId) {
      const cardId = state.cardId;
      setLinksLoading(true);
      api
        .listCardLinks(cardId)
        .then((fetched) => {
          setLinks(fetched);
          onLinksChange?.(cardId, fetched);
        })
        .catch(() => setLinks([]))
        .finally(() => setLinksLoading(false));
    } else {
      setLinks([]);
    }
    setMrUrl("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), description: description.trim(), dueDate, priority });
  }

  async function handleLinkMr(e: FormEvent) {
    e.preventDefault();
    if (!state?.cardId || !mrUrl.trim()) return;
    setLinking(true);
    try {
      const link = await api.createCardLink(state.cardId, mrUrl.trim());
      setLinks((prev) => {
        const next = [...prev, link];
        onLinksChange?.(state.cardId!, next);
        return next;
      });
      setMrUrl("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to link merge request");
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink(linkId: number) {
    if (!state?.cardId) return;
    const cardId = state.cardId;
    const previous = links;
    const next = links.filter((l) => l.id !== linkId);
    setLinks(next);
    onLinksChange?.(cardId, next);
    try {
      await api.deleteCardLink(linkId);
    } catch (err) {
      setLinks(previous);
      onLinksChange?.(cardId, previous);
      toast.error(err instanceof ApiError ? err.message : "Failed to unlink merge request");
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.mode === "edit" ? "Edit card" : "Add card"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="card-title">Title</Label>
            <Input
              id="card-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Card title"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="card-description">Description</Label>
            <Textarea
              id="card-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details"
              rows={4}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Priority</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPriority(null)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  priority === null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-card text-muted-foreground hover:bg-accent"
                )}
              >
                None
              </button>
              {PRIORITY_OPTIONS.map((option) => {
                const active = priority === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPriority(option)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/60 bg-card text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <span className={cn("size-2 shrink-0 rounded-full", PRIORITY_META[option].dot)} />
                    {PRIORITY_META[option].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="card-due-date">Due date</Label>
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate(null)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                  Clear
                </button>
              )}
            </div>
            <Input
              id="card-due-date"
              type="date"
              value={dueDate ?? ""}
              onChange={(e) => setDueDate(e.target.value || null)}
            />
          </div>

          {state?.mode === "edit" && state.cardId && (
            <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
              <Label>Linked merge requests</Label>
              {linksLoading ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : (
                links.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {links.map((link) => (
                      <div
                        key={link.id}
                        className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-sm"
                      >
                        <GitMerge
                          className={cn(
                            "size-3.5 shrink-0",
                            MR_STATE_META[link.state]?.text ?? "text-muted-foreground"
                          )}
                        />
                        <a
                          href={link.mr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 flex-1 truncate hover:underline"
                        >
                          !{link.mr_iid} {link.title}
                        </a>
                        <span
                          className={cn(
                            "shrink-0 text-xs font-medium",
                            MR_STATE_META[link.state]?.text ?? "text-muted-foreground"
                          )}
                        >
                          {MR_STATE_META[link.state]?.label ?? link.state}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUnlink(link.id)}
                          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Paste a GitLab merge request URL"
                  value={mrUrl}
                  onChange={(e) => setMrUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleLinkMr(e);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 rounded-lg"
                  disabled={linking || !mrUrl.trim()}
                  onClick={handleLinkMr}
                >
                  {linking ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Link
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : state?.mode === "edit" ? "Save changes" : "Add card"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
