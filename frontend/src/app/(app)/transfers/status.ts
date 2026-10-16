import type { TransferStatus } from "@/lib/types";

export const TRANSFER_STATUS: Record<TransferStatus, { label: string; tone: "neutral" | "ok" | "muted" | "brand" }> = {
  IN_TRANSIT: { label: "On the way", tone: "brand" },
  RECEIVED: { label: "Received", tone: "ok" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};
