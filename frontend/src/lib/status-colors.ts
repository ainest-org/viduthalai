export const STATUS_DOT_COLORS = [
  "bg-[#ff9f0a]", // orange
  "bg-[#0a84ff]", // blue
  "bg-[#30d158]", // green
  "bg-[#bf5af2]", // purple
  "bg-[#ff375f]", // pink
  "bg-[#ffd60a]", // yellow
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function dotColorForStatus(name: string): string {
  return STATUS_DOT_COLORS[hashString(name.trim().toLowerCase()) % STATUS_DOT_COLORS.length];
}
