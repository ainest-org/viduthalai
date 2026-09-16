import type { MergeRequestState } from "@/lib/types";

export const MR_STATE_META: Record<MergeRequestState, { label: string; text: string }> = {
  opened: { label: "Open", text: "text-[#0a84ff]" },
  merged: { label: "Merged", text: "text-[#8944ab]" },
  closed: { label: "Closed", text: "text-[#ff375f]" },
  locked: { label: "Locked", text: "text-muted-foreground" },
};
