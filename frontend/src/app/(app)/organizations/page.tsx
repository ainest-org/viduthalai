"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { OrganizationWithRole } from "@/lib/types";
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

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<OrganizationWithRole[] | null>(null);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .listOrganizations()
      .then(setOrgs)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load organizations"));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const org = await api.createOrganization(name.trim());
      setOrgs((prev) => [...(prev ?? []), { ...org, role: "admin" }]);
      setName("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create organization");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground">Admins, PMs, and devs — projects live here</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full px-4">
              <Plus />
              New organization
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create an organization</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <Input
                autoFocus
                placeholder="Organization name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <DialogFooter>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create organization"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {orgs === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You&apos;re not part of an organization yet. Create one to start assigning PMs and devs to
          projects.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {orgs.map((org) => (
            <Link
              key={org.id}
              href={`/organizations/${org.id}`}
              className="block rounded-2xl border border-border/60 bg-card p-5 card-shadow card-shadow-hover transition-shadow duration-200"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold tracking-tight">{org.name}</h2>
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground capitalize">
                  {org.role}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
