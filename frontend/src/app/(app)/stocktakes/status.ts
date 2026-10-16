import type { StocktakeStatus } from "@/lib/types";

export const STATUS_LABELS: Record<StocktakeStatus, { label: string; tone: "neutral" | "ok" | "muted" | "brand" }> = {
  COUNTING: { label: "Counting", tone: "brand" },
  SUBMITTED: { label: "Waiting for approval", tone: "neutral" },
  APPROVED: { label: "Approved", tone: "ok" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};
