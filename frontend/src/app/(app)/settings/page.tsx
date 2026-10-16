"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Badge, Button, Field, Input, Modal, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { loadSettings } from "@/lib/settings";
import type { Settings, TaxRate } from "@/lib/types";

type Message = { kind: "error" | "success"; text: string };

export default function SettingsPage() {
  /** `saved` is what the server has; `settings` is what's on screen. */
  const [saved, setSaved] = useState<Settings | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rates, setRates] = useState<TaxRate[] | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingRate, setEditingRate] = useState<TaxRate | "new" | null>(null);

  const loadRates = useCallback(() => api<TaxRate[]>("/tax-rates", { query: { all: "true" } }).then(setRates), []);

  useEffect(() => {
    api<Settings>("/settings")
      .then((s) => {
        setSaved(s);
        setSettings(s);
      })
      .catch((e) => setMessage({ kind: "error", text: e.message }));
    loadRates().catch((e) => setMessage({ kind: "error", text: e.message }));
  }, [loadRates]);

  const changedKeys = settings && saved ? (Object.keys(settings) as (keyof Settings)[]).filter((k) => settings[k] !== saved[k]) : [];
  const dirty = changedKeys.length > 0;
  const isChanged = (key: keyof Settings) => changedKeys.includes(key);

  // Success messages fade away on their own; errors stay until the next try.
  useEffect(() => {
    if (message?.kind !== "success") return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  // Warn before closing the tab or reloading with edits that weren't saved.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!settings || !saved || !rates) return <Spinner />;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings({ ...settings, [key]: value });
    if (message?.kind === "success") setMessage(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const next = await api<Settings>("/settings", { method: "PATCH", body: settings });
      setSaved(next);
      setSettings(next);
      await loadSettings(true);
      setMessage({ kind: "success", text: "Settings saved" });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setSettings(saved);
    setMessage(null);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" description="Business details, VAT, invoices and label printing." />
      {message && (
        <div className="mb-4">
          <Alert kind={message.kind}>{message.kind === "success" ? `✓ ${message.text}` : message.text}</Alert>
        </div>
      )}

      <form onSubmit={save} className="mb-10 flex flex-col gap-5">
        <Section title="General">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name" changed={isChanged("businessName")}>
              {(id) => <Input id={id} value={settings.businessName} onChange={(e) => set("businessName", e.target.value)} required />}
            </Field>
            <Field label="Currency" hint="3-letter code, e.g. EUR" changed={isChanged("currency")}>
              {(id) => <Input id={id} value={settings.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} required />}
            </Field>
          </div>
          <Field label="Prices are entered" hint="Shop prices in Malta normally include VAT." changed={isChanged("pricesIncludeTax")}>
            {(id) => (
              <Select id={id} value={settings.pricesIncludeTax ? "incl" : "excl"} onChange={(e) => set("pricesIncludeTax", e.target.value === "incl")}>
                <option value="incl">Including VAT</option>
                <option value="excl">Excluding VAT (VAT added on top)</option>
              </Select>
            )}
          </Field>
        </Section>

        <Section title="Invoices & receipts" description="Printed at the top of every invoice and receipt.">
          <Field label="Address" changed={isChanged("businessAddress")}>
            {(id) => <Input id={id} value={settings.businessAddress} onChange={(e) => set("businessAddress", e.target.value)} maxLength={300} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" changed={isChanged("businessPhone")}>
              {(id) => <Input id={id} value={settings.businessPhone} onChange={(e) => set("businessPhone", e.target.value)} maxLength={50} />}
            </Field>
            <Field label="VAT number" hint="e.g. MT12345678" changed={isChanged("vatNumber")}>
              {(id) => <Input id={id} value={settings.vatNumber} onChange={(e) => set("vatNumber", e.target.value)} maxLength={30} />}
            </Field>
          </div>
          <Field label="Footer message" hint="e.g. returns policy or a thank-you line" changed={isChanged("receiptFooter")}>
            {(id) => <Input id={id} value={settings.receiptFooter} onChange={(e) => set("receiptFooter", e.target.value)} maxLength={300} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Receipt paper width (mm)" hint="Usually 80 or 58" changed={isChanged("receiptWidthMm")}>
              {(id) => (
                <Input id={id} type="number" min={48} max={120} value={settings.receiptWidthMm} onChange={(e) => set("receiptWidthMm", Number(e.target.value))} required />
              )}
            </Field>
            <Field label="Max discount without approval (%)" hint="Cashiers need a manager above this" changed={isChanged("maxDiscountPercent")}>
              {(id) => (
                <Input id={id} type="number" min={0} max={100} value={settings.maxDiscountPercent} onChange={(e) => set("maxDiscountPercent", Number(e.target.value))} required />
              )}
            </Field>
          </div>
        </Section>

        <Section title="Barcode labels" description="Set this to the sticker size of your label printer.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Width (mm)" changed={isChanged("labelWidthMm")}>
              {(id) => (
                <Input id={id} type="number" min={20} max={150} value={settings.labelWidthMm} onChange={(e) => set("labelWidthMm", Number(e.target.value))} required />
              )}
            </Field>
            <Field label="Height (mm)" changed={isChanged("labelHeightMm")}>
              {(id) => (
                <Input id={id} type="number" min={10} max={150} value={settings.labelHeightMm} onChange={(e) => set("labelHeightMm", Number(e.target.value))} required />
              )}
            </Field>
            <Field label="Show price on label" changed={isChanged("labelShowPrice")}>
              {(id) => (
                <Select id={id} value={settings.labelShowPrice ? "yes" : "no"} onChange={(e) => set("labelShowPrice", e.target.value === "yes")}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </Select>
              )}
            </Field>
          </div>
        </Section>

        {/* Appears as soon as something is edited, and stays in view while scrolling. */}
        {dirty && (
          <div
            role="status"
            className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-20 flex animate-sheet-up flex-col gap-3 rounded-2xl border border-brand/20 bg-white/95 p-3 shadow-xl backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:pl-5 lg:bottom-4"
          >
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <span className="size-2 shrink-0 rounded-full bg-brand" />
              {changedKeys.length} unsaved change{changedKeys.length === 1 ? "" : "s"}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button type="button" variant="secondary" onClick={discard} disabled={saving}>
                Discard
              </Button>
              <Button type="submit" disabled={saving} className="sm:px-6">
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </form>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Tax rates</h2>
        <Button variant="secondary" onClick={() => setEditingRate("new")}>
          Add tax rate
        </Button>
      </div>
      {rates.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-sm">
          No tax rates yet. Add your VAT rates (e.g. Standard 18%) before creating products.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white shadow-sm">
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
              setMessage({ kind: "success", text: "Tax rate saved" });
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="font-semibold tracking-tight text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
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
