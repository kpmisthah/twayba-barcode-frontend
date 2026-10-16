"use client";

import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";

export interface Approval {
  login: string;
  password: string;
  reason: string;
}

/** An admin/manager enters their own login on this device to approve an override, with a reason. */
export function ApprovalForm({
  explanation,
  submitLabel,
  onSubmit,
}: {
  explanation: string;
  submitLabel: string;
  onSubmit: (approval: Approval) => Promise<void>;
}) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit({ login, password, reason });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-muted">{explanation}</p>
      {error && <Alert>{error}</Alert>}
      <Field label="Reason">{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={300} autoFocus />}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Manager email or phone">{(id) => <Input id={id} value={login} onChange={(e) => setLogin(e.target.value)} required autoComplete="off" />}</Field>
        <Field label="Manager password">
          {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />}
        </Field>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Checking…" : submitLabel}
      </Button>
    </form>
  );
}
