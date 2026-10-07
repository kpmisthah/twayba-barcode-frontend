import { assetUrl } from "@/lib/api";

export function Thumb({ src, size = "size-12" }: { src?: string; size?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- images are served by the API
    <img src={assetUrl(src)} alt="" className={`${size} shrink-0 rounded-lg border border-line object-cover`} />
  ) : (
    <div className={`${size} shrink-0 rounded-lg border border-line bg-surface`} />
  );
}
