"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { GitBranch } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import type { GitLabLoginProvider } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [gitlabProviders, setGitlabProviders] = useState<GitLabLoginProvider[]>([]);
  const [startingGitlab, setStartingGitlab] = useState(false);

  useEffect(() => {
    api
      .listGitLabLoginProviders()
      .then(setGitlabProviders)
      .catch(() => setGitlabProviders([]));
  }, []);

  useEffect(() => {
    const error = searchParams.get("gitlab_error");
    if (error) {
      toast.error(error);
      router.replace("/login", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGitlabLogin(orgId: number) {
    setStartingGitlab(true);
    try {
      const { authorize_url } = await api.startGitLabLogin(orgId);
      window.location.href = authorize_url;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to start GitLab sign-in");
      setStartingGitlab(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm rounded-2xl border-border/60 card-shadow">
        <CardHeader>
          <CardTitle className="text-xl font-semibold tracking-tight">Welcome back</CardTitle>
          <CardDescription>Log in to your Viduthalai account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="mt-2 w-full rounded-full" disabled={submitting}>
              {submitting ? "Logging in..." : "Log in"}
            </Button>
          </form>

          {gitlabProviders.length > 0 && (
            <>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="flex flex-col gap-2">
                {gitlabProviders.map((provider) => (
                  <Button
                    key={provider.org_id}
                    type="button"
                    variant="outline"
                    className="w-full rounded-full"
                    disabled={startingGitlab}
                    onClick={() => handleGitlabLogin(provider.org_id)}
                  >
                    <GitBranch />
                    Sign in with GitLab
                  </Button>
                ))}
              </div>
            </>
          )}

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
