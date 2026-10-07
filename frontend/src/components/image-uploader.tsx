"use client";

import { useRef, useState } from "react";
import { api, assetUrl } from "@/lib/api";
import { Alert, Button } from "./ui";

const MAX_IMAGES = 10;

/** Uploads images straight away and reports the list of URLs; first image is the main one. */
export function ImageUploader({ images, onChange }: { images: string[]; onChange: (images: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setUploading(true);
    const added: string[] = [];
    try {
      for (const file of Array.from(files).slice(0, MAX_IMAGES - images.length)) {
        const form = new FormData();
        form.append("file", file);
        const { url } = await api<{ url: string }>("/uploads/products", { method: "POST", body: form });
        added.push(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      if (added.length) onChange([...images, ...added]);
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-3">
        {images.map((src, i) => (
          <div key={src} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- images are served by the API */}
            <img src={assetUrl(src)} alt="" className="size-20 rounded-lg border border-line object-cover" />
            {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">Main</span>}
            <div className="mt-1 flex gap-1">
              {i > 0 && (
                <button type="button" className="rounded px-1.5 text-xs text-brand hover:bg-surface" onClick={() => onChange([src, ...images.filter((x) => x !== src)])}>
                  Main
                </button>
              )}
              <button type="button" className="rounded px-1.5 text-xs text-danger hover:bg-surface" onClick={() => onChange(images.filter((x) => x !== src))}>
                Remove
              </button>
            </div>
          </div>
        ))}
        {images.length < MAX_IMAGES && (
          <Button type="button" variant="secondary" className="size-20" disabled={uploading} onClick={() => input.current?.click()}>
            {uploading ? "…" : "+ Photo"}
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => upload(e.target.files)}
      />
      <p className="text-xs text-muted">JPG, PNG or WebP, up to 5 MB each. On a phone you can take a photo directly.</p>
    </div>
  );
}
