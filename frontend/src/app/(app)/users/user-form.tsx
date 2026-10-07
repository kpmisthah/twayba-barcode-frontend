"use client";

import { useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role, type User } from "@/lib/types";

const MIN_PASSWORD = 8;

/** Create (no `user`) or edit (with `user`) form. */
export function UserForm({
  user,
  roles,
  isSelf,
  onSaved,
}: {
  user?: User;
  roles: Role[];
  isSelf: boolean;
  onSaved: (user: User) => void;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? roles.find((r) => r === "CASHIER") ?? roles[0]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // When editing, the current role must be selectable even if it's outside `roles`.
  const roleOptions = user && !roles.includes(user.role) ? [user.role, ...roles] : roles;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() && !phone.trim()) {
      setError("Enter an email or a phone number so the person can log in");
      return;
    }
    setSaving(true);
    try {
      const saved = user
        ? await api<User>(`/users/${user.id}`, {
            method: "PATCH",
            body: {
              name,
              email: email.trim() || null,
              phone: phone.trim() || null,
              ...(isSelf ? {} : { role }),
            },
          })
        : await api<User>("/users", {
            method: "POST",
            body: {
              name,
              role,
              password,
              ...(email.trim() && { email: email.trim() }),
              ...(phone.trim() && { phone: phone.trim() }),
            },
          });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <Field label="Full name">
        {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus />}
      </Field>
      <Field label="Email" hint="Email or phone is used to log in">
        {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <Field label="Phone">
        {(id) => <Input id={id} type="tel" inputMode="tel" placeholder="+356 …" value={phone} onChange={(e) => setPhone(e.target.value)} />}
      </Field>
      <Field label="Role" hint={isSelf ? "You cannot change your own role" : ROLE_DESCRIPTIONS[role]}>
        {(id) => (
          <Select id={id} value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {!user && (
        <Field label="Password" hint={`At least ${MIN_PASSWORD} characters. Share it with the person privately.`}>
          {(id) => (
            <Input id={id} type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} required />
          )}
        </Field>
      )}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : user ? "Save changes" : "Create user"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ user, onDone }: { user: User; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api(`/users/${user.id}/reset-password`, { method: "POST", body: { newPassword: password } });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <p className="text-sm text-muted">Set a new password for {user.name}. They can change it later under My account.</p>
      <Field label="New password" hint={`At least ${MIN_PASSWORD} characters`}>
        {(id) => (
          <Input id={id} type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        )}
      </Field>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}
