"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Badge, Button, Field, Input, Modal, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { loadSettings } from "@/lib/settings";
import type { Settings, TaxRate } from "@/lib/types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rates, setRates] = useState<TaxRate[] | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingRate, setEditingRate] = useState<TaxRate | "new" | null>(null);

  const loadRates = useCallback(() => api<TaxRate[]>("/tax-rates", { query: { all: "true" } }).then(setRates), []);

  useEffect(() => {
    api<Settings>("/settings").then(setSettings).catch((e) => setMessage({ kind: "error", text: e.message }));
    loadRates().catch((e) => setMessage({ kind: "error", text: e.message }));
  }, [loadRates]);

  if (!settings || !rates) return <Spinner />;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings({ ...settings, [key]: value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      setSettings(await api<Settings>("/settings", { method: "PATCH", body: settings }));
      await loadSettings(true);
      setMessage({ kind: "success", text: "Settings saved" });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" description="Business details, VAT and label printing." />
      {message && (
        <div className="mb-4">
          <Alert kind={message.kind}>{message.text}</Alert>
        </div>
      )}

      <form onSubmit={save} className="mb-10 flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold text-ink">General</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name">
            {(id) => <Input id={id} value={settings.businessName} onChange={(e) => set("businessName", e.target.value)} required />}
          </Field>
          <Field label="Currency" hint="3-letter code, e.g. EUR">
            {(id) => (
              <Input id={id} value={settings.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} required />
            )}
          </Field>
        </div>
        <Field label="Prices are entered" hint="Shop prices in Malta normally include VAT.">
          {(id) => (
            <Select id={id} value={settings.pricesIncludeTax ? "incl" : "excl"} onChange={(e) => set("pricesIncludeTax", e.target.value === "incl")}>
              <option value="incl">Including VAT</option>
              <option value="excl">Excluding VAT (VAT added on top)</option>
            </Select>
          )}
        </Field>

        <h2 className="mt-4 font-semibold text-ink">Barcode labels</h2>
        <p className="-mt-2 text-sm text-muted">Set this to the sticker size of your label printer.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Width (mm)">
            {(id) => (
              <Input id={id} type="number" min={20} max={150} value={settings.labelWidthMm} onChange={(e) => set("labelWidthMm", Number(e.target.value))} required />
            )}
          </Field>
          <Field label="Height (mm)">
            {(id) => (
              <Input id={id} type="number" min={10} max={150} value={settings.labelHeightMm} onChange={(e) => set("labelHeightMm", Number(e.target.value))} required />
            )}
          </Field>
          <Field label="Show price on label">
            {(id) => (
              <Select id={id} value={settings.labelShowPrice ? "yes" : "no"} onChange={(e) => set("labelShowPrice", e.target.value === "yes")}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </Select>
            )}
          </Field>
        </div>
        <Button type="submit" disabled={saving} className="self-start">
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </form>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Tax rates</h2>
        <Button variant="secondary" onClick={() => setEditingRate("new")}>
          Add tax rate
        </Button>
      </div>
      {rates.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-6 text-sm text-muted">
          No tax rates yet. Add your VAT rates (e.g. Standard 18%) before creating products.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {rates.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={r.active ? "font-medium text-ink" : "text-muted line-through"}>{r.name}</span>
                <span className="text-sm text-muted">{Number(r.rate)}%</span>
                {r.isDefault && <Badge tone="brand">Default</Badge>}
                {!r.active && <Badge tone="muted">Inactive</Badge>}
              </div>
              <Button variant="secondary" onClick={() => setEditingRate(r)}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Modal title={editingRate === "new" ? "Add tax rate" : "Edit tax rate"} open={editingRate !== null} onClose={() => setEditingRate(null)}>
        {editingRate !== null && (
          <TaxRateForm
            rate={editingRate === "new" ? undefined : editingRate}
            onSaved={() => {
              setEditingRate(null);
              loadRates();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function TaxRateForm({ rate, onSaved }: { rate?: TaxRate; onSaved: () => void }) {
  const [name, setName] = useState(rate?.name ?? "");
  const [value, setValue] = useState(rate ? String(Number(rate.rate)) : "");
  const [isDefault, setIsDefault] = useState(rate?.isDefault ?? false);
  const [active, setActive] = useState(rate?.active ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = { name, rate: Number(value), isDefault, active };
      await api(rate ? `/tax-rates/${rate.id}` : "/tax-rates", { method: rate ? "PATCH" : "POST", body });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard VAT" required autoFocus />}</Field>
      <Field label="Rate (%)">
        {(id) => <Input id={id} type="number" min={0} max={100} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} required />}
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
        <input type="checkbox" className="size-5" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        Default for new products
      </label>
      {rate && (
        <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
          <input type="checkbox" className="size-5" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      )}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
