"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Badge, Button, Input, Modal, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, ROLES, type Role, type User } from "@/lib/types";
import { ResetPasswordForm, UserForm } from "./user-form";

type Dialog = { kind: "create" } | { kind: "edit"; user: User } | { kind: "password"; user: User } | null;

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [assignable, setAssignable] = useState<Role[]>([]);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      setUsers(await api<User[]>("/users", { query: { q, role, active: status } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users");
    }
  }, [q, role, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    api<Role[]>("/users/assignable-roles").then(setAssignable).catch(() => setAssignable([]));
  }, []);

  if (!me) return null;
  const canManage = (u: User) => u.id === me.id || assignable.includes(u.role);

  async function toggleActive(u: User) {
    const verb = u.active ? "Deactivate" : "Activate";
    if (!confirm(`${verb} ${u.name}?${u.active ? " They will be logged out and unable to sign in." : ""}`)) return;
    try {
      await api(`/users/${u.id}/active`, { method: "PATCH", body: { active: !u.active } });
      setNotice(`${u.name} ${u.active ? "deactivated" : "activated"}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update user");
    }
  }

  function closeDialog(message?: string) {
    setDialog(null);
    if (message) {
      setNotice(message);
      load();
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Every person gets their own login. Deactivate people who leave — history keeps their name."
        action={<Button onClick={() => setDialog({ kind: "create" })}>Add user</Button>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px_160px]">
        <Input placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </div>

      <div className="mb-4 flex flex-col gap-2">
        {error && <Alert>{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}
      </div>

      {!users ? (
        <Spinner />
      ) : users.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-8 text-center text-sm text-muted">No users match.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {users.map((u) => (
            <li key={u.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-medium ${u.active ? "text-ink" : "text-muted line-through"}`}>{u.name}</span>
                  <Badge tone="brand">{ROLE_LABELS[u.role]}</Badge>
                  {!u.active && <Badge tone="muted">Inactive</Badge>}
                  {u.id === me.id && <Badge>You</Badge>}
                </div>
                <p className="mt-1 truncate text-sm text-muted">
                  {[u.email, u.phone].filter(Boolean).join(" · ")}
                  {" · "}
                  {u.lastLoginAt ? `Last login ${new Date(u.lastLoginAt).toLocaleString()}` : "Never logged in"}
                </p>
              </div>
              {canManage(u) && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setDialog({ kind: "edit", user: u })}>
                    Edit
                  </Button>
                  {u.id !== me.id && (
                    <>
                      <Button variant="secondary" onClick={() => setDialog({ kind: "password", user: u })}>
                        Reset password
                      </Button>
                      <Button variant={u.active ? "ghost" : "secondary"} onClick={() => toggleActive(u)}>
                        {u.active ? "Deactivate" : "Activate"}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal title="Add user" open={dialog?.kind === "create"} onClose={() => closeDialog()}>
        <UserForm roles={assignable} isSelf={false} onSaved={(u) => closeDialog(`${u.name} created`)} />
      </Modal>
      <Modal title="Edit user" open={dialog?.kind === "edit"} onClose={() => closeDialog()}>
        {dialog?.kind === "edit" && (
          <UserForm
            user={dialog.user}
            roles={assignable}
            isSelf={dialog.user.id === me.id}
            onSaved={(u) => closeDialog(`${u.name} saved`)}
          />
        )}
      </Modal>
      <Modal title="Reset password" open={dialog?.kind === "password"} onClose={() => closeDialog()}>
        {dialog?.kind === "password" && (
          <ResetPasswordForm user={dialog.user} onDone={() => closeDialog(`Password reset for ${dialog.user.name}`)} />
        )}
      </Modal>
    </>
  );
}
