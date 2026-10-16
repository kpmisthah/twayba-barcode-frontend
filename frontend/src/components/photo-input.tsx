"use client";

import { useState } from "react";
import { api, assetUrl } from "@/lib/api";

const MAX_SIDE = 1600;

/** Phone photos are often 5–10 MB; shrink to ≤1600 px JPEG before uploading. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // unknown format — let the server decide
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.8));
}

/** Take or choose a photo (opens the camera on phones); uploads it and reports its URL. */
export function PhotoInput({ value, onChange, label = "Photo (optional)" }: { value: string | null; onChange: (url: string | null) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", await shrink(file), "photo.jpg");
      const { url } = await api<{ url: string }>("/uploads/deliveries", { method: "POST", body: form });
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- served by the API */}
          <img src={assetUrl(value)} alt="" className="size-20 rounded-lg border border-line object-cover" />
          <button type="button" className="text-sm text-danger" onClick={() => onChange(null)}>
            Remove
          </button>
        </div>
      ) : (
        <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-dashed border-line px-4 text-sm font-medium text-ink hover:bg-surface">
          {busy ? "Uploading…" : "📷 Take photo"}
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
