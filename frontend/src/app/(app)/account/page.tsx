"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Alert, Badge, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/types";

const MIN_PASSWORD = 8;

const STRENGTH = [
  { label: "Too short", bar: "bg-danger", text: "text-danger" },
  { label: "Weak", bar: "bg-danger", text: "text-danger" },
  { label: "Fair", bar: "bg-warn", text: "text-warn" },
  { label: "Good", bar: "bg-brand", text: "text-brand" },
  { label: "Strong", bar: "bg-ok", text: "text-ok" },
];

/** 0 = too short, then one point each for mixed case, a digit, and a symbol (+ length ≥ 12 counts as a bonus). */
function strengthOf(password: string) {
  if (password.length < MIN_PASSWORD) return 0;
  const points = [/[a-z]/.test(password) && /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password), password.length >= 12].filter(Boolean).length;
  return Math.max(1, Math.min(4, points));
}

export default function AccountPage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const strength = strengthOf(next);
  const mismatch = confirm.length > 0 && next !== confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (next !== confirm) {
      setMessage({ kind: "error", text: "The new passwords do not match" });
      return;
    }
    setSaving(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: { currentPassword: current, newPassword: next },
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ kind: "success", text: "Password changed" });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not change password" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="My account" description="Your profile and sign-in security." />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        {/* Profile */}
        <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <div className="relative h-24 overflow-hidden bg-linear-to-br from-brand to-violet-500">
            <span className="pointer-events-none absolute -top-10 -right-10 size-36 rounded-full bg-white/10" />
          </div>
          <div className="px-5 pb-6">
            <span className="relative z-10 -mt-10 flex size-20 items-center justify-center rounded-full border-4 border-white bg-linear-to-br from-brand to-violet-500 text-2xl font-semibold text-white shadow-md">
              {user.name.trim().charAt(0).toUpperCase()}
            </span>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-ink">{user.name}</h2>
            <div className="mt-1.5">
              <Badge tone="brand">{ROLE_LABELS[user.role]}</Badge>
            </div>
            <dl className="mt-5 flex flex-col gap-4 border-t border-line pt-5 text-sm">
              <Detail icon="mail" label="Email" value={user.email} />
              <Detail icon="phone" label="Phone" value={user.phone} />
            </dl>
          </div>
        </section>

        {/* Password */}
        <section className="rounded-2xl border border-line bg-white shadow-sm">
          <header className="flex items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Icon name="lock" className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold tracking-tight text-ink">Change password</h2>
              <p className="text-sm text-muted">Use at least {MIN_PASSWORD} characters. A longer, mixed password is safer.</p>
            </div>
          </header>

          <form onSubmit={onSubmit} className="flex flex-col gap-5 p-5 sm:p-6">
            {message && <Alert kind={message.kind}>{message.text}</Alert>}

            <Field label="Current password">
              {(id) => <PasswordInput id={id} autoComplete="current-password" value={current} onChange={setCurrent} />}
            </Field>

            <div className="flex flex-col gap-2">
              <Field label="New password" hint={`At least ${MIN_PASSWORD} characters`}>
                {(id) => <PasswordInput id={id} autoComplete="new-password" minLength={MIN_PASSWORD} value={next} onChange={setNext} />}
              </Field>
              {next.length > 0 && (
                <div className="flex items-center gap-3" aria-live="polite">
                  <div className="flex flex-1 gap-1.5" aria-hidden="true">
                    {[1, 2, 3, 4].map((i) => (
                      <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= strength ? STRENGTH[strength].bar : "bg-line"}`} />
                    ))}
                  </div>
                  <span className={`w-16 text-right text-xs font-semibold ${STRENGTH[strength].text}`}>{STRENGTH[strength].label}</span>
                </div>
              )}
            </div>

            <Field label="Repeat new password" error={mismatch ? "The passwords don't match" : undefined} hint={confirm && !mismatch ? "Passwords match" : undefined}>
              {(id) => <PasswordInput id={id} autoComplete="new-password" minLength={MIN_PASSWORD} value={confirm} onChange={setConfirm} />}
            </Field>

            <div className="flex justify-end border-t border-line pt-5">
              <Button type="submit" disabled={saving} className="w-full sm:w-auto sm:px-8">
                {saving ? "Saving…" : "Update password"}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function Detail({ icon, label, value }: { icon: IconName; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted">
        <Icon name={icon} className="size-4.5" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wider text-muted">{label}</dt>
        <dd className="mt-0.5 break-all text-ink">{value ?? "—"}</dd>
      </div>
    </div>
  );
}

/** Password box with a show / hide button. */
function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="pr-12!"
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted transition-colors hover:text-ink"
      >
        <Icon name={shown ? "eye-off" : "eye"} className="size-5" />
      </button>
    </div>
  );
}
