export const formatShortAddress = (address: string) => {
  if (!address) return "-";
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

export const formatRelativeDate = (iso: string | number): string => {
  const then = typeof iso === "number" ? new Date(iso) : new Date(iso);
  const now = new Date();
  const diff = now.getTime() - then.getTime();
  const diffMinutes = Math.floor(diff / (1000 * 60));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
};
