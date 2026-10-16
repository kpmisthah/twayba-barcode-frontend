"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Badge, Button, Input, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Category } from "@/lib/types";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      api<Category[]>("/categories", { query: { all: "true" } })
        .then(setCategories)
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Categories" description="Group products, e.g. Chairs, Shelving, Electronics." />
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api("/categories", { method: "POST", body: { name } });
            setName("");
          });
        }}
      >
        <Input placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} aria-label="New category name" />
        <Button type="submit">Add</Button>
      </form>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {!categories ? (
        <Spinner />
      ) : categories.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-6 text-sm text-muted">No categories yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {categories.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              {editing?.id === c.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await api(`/categories/${c.id}`, { method: "PATCH", body: { name: editing.name } });
                      setEditing(null);
                    });
                  }}
                >
                  <Input value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} required autoFocus aria-label="Category name" />
                  <Button type="submit">Save</Button>
                  <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className={c.active ? "font-medium text-ink" : "text-muted line-through"}>{c.name}</span>
                    <span className="text-sm text-muted">{c._count?.products ?? 0} products</span>
                    {!c.active && <Badge tone="muted">Hidden</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setEditing({ id: c.id, name: c.name })}>
                      Rename
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => run(() => api(`/categories/${c.id}`, { method: "PATCH", body: { active: !c.active } }))}
                    >
                      {c.active ? "Hide" : "Show"}
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
