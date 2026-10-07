"use client";

import { useEffect, useId } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark disabled:bg-brand/50",
  secondary: "bg-white text-ink border border-line hover:bg-surface disabled:text-muted",
  danger: "bg-danger text-white hover:bg-danger/90 disabled:bg-danger/50",
  ghost: "text-ink hover:bg-surface disabled:text-muted",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

const CONTROL =
  "min-h-11 w-full rounded-lg border border-line bg-white px-3 text-base text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 sm:text-sm";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success"; children: React.ReactNode }) {
  const style =
    kind === "error"
      ? "border-danger/30 bg-danger/5 text-danger"
      : "border-ok/30 bg-ok/5 text-ok";
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${style}`}>
      {children}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "muted" | "brand"; children: React.ReactNode }) {
  const styles = {
    neutral: "bg-surface text-ink",
    ok: "bg-ok/10 text-ok",
    muted: "bg-surface text-muted",
    brand: "bg-brand/10 text-brand",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[tone]}`}>
      {children}
    </span>
  );
}

export function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10" aria-label="Loading">
      <div className="size-7 animate-spin rounded-full border-2 border-line border-t-brand" />
    </div>
  );
}
