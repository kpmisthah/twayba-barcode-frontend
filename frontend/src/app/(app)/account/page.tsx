"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/types";

const MIN_PASSWORD = 8;

export default function AccountPage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

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
    <div className="max-w-lg">
      <PageHeader title="My account" />
      <dl className="mb-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-xl border border-line bg-white p-5 text-sm">
        <dt className="text-muted">Name</dt>
        <dd className="text-ink">{user.name}</dd>
        <dt className="text-muted">Role</dt>
        <dd className="text-ink">{ROLE_LABELS[user.role]}</dd>
        <dt className="text-muted">Email</dt>
        <dd className="break-all text-ink">{user.email ?? "—"}</dd>
        <dt className="text-muted">Phone</dt>
        <dd className="text-ink">{user.phone ?? "—"}</dd>
      </dl>

      <h2 className="mb-3 text-lg font-semibold text-ink">Change password</h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
        {message && <Alert kind={message.kind}>{message.text}</Alert>}
        <Field label="Current password">
          {(id) => (
            <Input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          )}
        </Field>
        <Field label="New password" hint={`At least ${MIN_PASSWORD} characters`}>
          {(id) => (
            <Input id={id} type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={next} onChange={(e) => setNext(e.target.value)} required />
          )}
        </Field>
        <Field label="Repeat new password">
          {(id) => (
            <Input id={id} type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          )}
        </Field>
        <Button type="submit" disabled={saving} className="self-start">
          {saving ? "Saving…" : "Change password"}
        </Button>
      </form>
    </div>
  );
}
