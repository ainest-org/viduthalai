"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

function Spinner() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">Signing you in with GitLab...</p>
      </div>
    </div>
  );
}

function GitLabLoginCompleteInner() {
  const { completeGitLabLogin } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const exchange = searchParams.get("exchange");
    if (!exchange) {
      router.replace("/login");
      return;
    }

    completeGitLabLogin(exchange).catch((err) => {
      toast.error(err instanceof ApiError ? err.message : "GitLab sign-in failed");
      router.replace("/login");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return <Spinner />;
}

export default function GitLabLoginCompletePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <GitLabLoginCompleteInner />
    </Suspense>
  );
}
