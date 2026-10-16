"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Badge, Button, Field, Input, Modal, Select, Spinner } from "@/components/ui";
import { api, apiBlob } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { LOCATION_CHILD_TYPES, LOCATION_TYPE_LABELS, type Location, type LocationType } from "@/lib/types";
import { LocationStockView } from "@/components/location-stock";

const SYSTEM_TYPES: LocationType[] = ["TRANSIT", "DAMAGED"];
const MAX_PER_ADD = 100;

type Dialog =
  | { kind: "add"; parent: Location | null }
  | { kind: "rename"; location: Location }
  | { kind: "stock"; location: Location }
  | null;

export default function LocationsPage() {
  const { user } = useAuth();
  const canWrite = can(user?.role, "locationWrite");
  const canPrint = can(user?.role, "labelPrint");

  const [locations, setLocations] = useState<Location[] | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      api<Location[]>("/locations", { query: { all: "true" } })
        .then((list) => {
          setLocations(list);
          // Open the sites the first time so the tree isn't one closed line per site.
          setExpanded((prev) => (prev.size ? prev : new Set(list.filter((l) => l.type === "SITE").map((l) => l.id))));
        })
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  // The API returns tree order (parents before children), so grouping keeps siblings sorted.
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, Location[]>();
    for (const l of locations ?? []) {
      if (!showHidden && !l.active) continue;
      map.set(l.parentId, [...(map.get(l.parentId) ?? []), l]);
    }
    return map;
  }, [locations, showHidden]);

  const sites = (childrenOf.get(null) ?? []).filter((l) => !SYSTEM_TYPES.includes(l.type));
  const system = (childrenOf.get(null) ?? []).filter((l) => SYSTEM_TYPES.includes(l.type));

  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function printLabels(location: Location) {
    // Open the tab now (before awaiting) so the browser doesn't block it as a pop-up.
    const tab = window.open("", "_blank");
    setError("");
    try {
      const pdf = await apiBlob("/labels/locations", {
        method: "POST",
        body: { locationIds: [location.id], withChildren: true },
      });
      const url = URL.createObjectURL(pdf);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Could not create labels");
    }
  }

  function renderNode(location: Location, depth: number): React.ReactNode {
    const kids = childrenOf.get(location.id) ?? [];
    const open = expanded.has(location.id);
    const addable = LOCATION_CHILD_TYPES[location.type];
    return (
      <li key={location.id}>
        <div
          className="flex flex-col gap-2 border-b border-line py-2 pr-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
        >
          <div className="flex min-w-0 items-center gap-2">
            {kids.length ? (
              <button
                onClick={() => toggle(location.id)}
                aria-label={open ? `Collapse ${location.name}` : `Expand ${location.name}`}
                aria-expanded={open}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface"
              >
                {open ? "▾" : "▸"}
              </button>
            ) : (
              <span className="size-9 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={location.active ? "font-medium text-ink" : "text-muted line-through"}>{location.name}</span>
                <Badge tone="muted">{LOCATION_TYPE_LABELS[location.type]}</Badge>
                {!location.active && <Badge tone="muted">Hidden</Badge>}
                {!open && kids.length > 0 && <span className="text-xs text-muted">{kids.length} inside</span>}
              </div>
              <span className="font-mono text-xs text-muted">{location.code}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 pl-11 sm:pl-0">
            {canWrite && location.active && addable.length > 0 && (
              <Button variant="secondary" className="px-3" onClick={() => setDialog({ kind: "add", parent: location })}>
                + {addable.map((t) => LOCATION_TYPE_LABELS[t]).join(" / ")}
              </Button>
            )}
            <Button variant="ghost" className="px-3" onClick={() => setDialog({ kind: "stock", location })}>
              Stock
            </Button>
            {canPrint && location.active && (
              <Button
                variant="ghost"
                className="px-3"
                title="Labels for this location and everything inside it"
                onClick={() => printLabels(location)}
              >
                Labels
              </Button>
            )}
            {canWrite && (
              <>
                <Button variant="ghost" className="px-3" onClick={() => setDialog({ kind: "rename", location })}>
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  className="px-3"
                  onClick={() => run(() => api(`/locations/${location.id}`, { method: "PATCH", body: { active: !location.active } }))}
                >
                  {location.active ? "Hide" : "Show"}
                </Button>
              </>
            )}
          </div>
        </div>
        {open && kids.length > 0 && <ul>{kids.map((k) => renderNode(k, depth + 1))}</ul>}
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Locations"
        description="Where stock is kept: site › floor › room › shelf › space. Print a label for each space and stick it on the shelf."
        action={
          canWrite && (
            <Button onClick={() => setDialog({ kind: "add", parent: null })}>+ Add site</Button>
          )
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <label className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm text-ink">
        <input type="checkbox" className="size-4" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
        Show hidden locations
      </label>

      {!locations ? (
        <Spinner />
      ) : sites.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted">
          <p>No sites yet. Start with your garages and shop, e.g. &ldquo;Naxxar Garage&rdquo; or &ldquo;Hamrun Shop&rdquo;.</p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-white [&>li:last-child>div]:border-b-0">
          {sites.map((s) => renderNode(s, 0))}
        </ul>
      )}

      {canWrite && locations && (
        <p className="mt-3 text-xs text-muted">
          Tip: add the shop display as a room (e.g. &ldquo;Display&rdquo;) so stock on display is tracked too.
        </p>
      )}

      {system.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-ink">System locations</h2>
          <p className="mb-3 text-sm text-muted">Used automatically for loaded deliveries and damaged stock. They can&rsquo;t be changed.</p>
          <ul className="divide-y divide-line rounded-xl border border-line bg-white">
            {system.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <span className="block font-medium text-ink">{l.name}</span>
                  <span className="font-mono text-xs text-muted">{l.code}</span>
                </div>
                <Button variant="ghost" className="px-3" onClick={() => setDialog({ kind: "stock", location: l })}>
                  Stock
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        title={
          dialog?.kind === "rename"
            ? "Rename location"
            : dialog?.kind === "stock"
              ? `Stock in ${dialog.location.name}`
              : dialog?.parent
                ? `Add to ${dialog.parent.name}`
                : "Add site"
        }
        open={!!dialog}
        onClose={() => setDialog(null)}
      >
        {dialog?.kind === "add" && (
          <AddLocationsForm
            parent={dialog.parent}
            onDone={async () => {
              if (dialog.parent) setExpanded((prev) => new Set(prev).add(dialog.parent!.id));
              setDialog(null);
              await load();
            }}
          />
        )}
        {dialog?.kind === "stock" && <LocationStockView locationId={dialog.location.id} />}
        {dialog?.kind === "rename" && (
          <RenameForm
            location={dialog.location}
            onDone={async () => {
              setDialog(null);
              await load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ add

const PLACEHOLDERS: Partial<Record<LocationType, string>> = {
  SITE: "e.g. Naxxar Garage",
  FLOOR: "e.g. Top",
  ROOM: "e.g. Room 1",
  SHELF: "e.g. Shelf A",
  SPACE: "e.g. A1",
};

/** Sensible starting values for "add several", e.g. spaces A1–A6 on Shelf A. */
function rangeDefaults(type: LocationType, parent: Location | null) {
  switch (type) {
    case "SPACE":
      return { several: true, prefix: parent?.name.replace(/^shelf\s*/i, "") ?? "", from: "1", to: "6" };
    case "SHELF":
      return { several: true, prefix: "Shelf ", from: "A", to: "C" };
    case "ROOM":
      return { several: false, prefix: "Room ", from: "1", to: "3" };
    default:
      return { several: false, prefix: "", from: "1", to: "3" };
  }
}

/** "A", "1", "6" → A1…A6; "Shelf ", "A", "C" → Shelf A…Shelf C. Returns an error message if invalid. */
function rangeNames(prefix: string, from: string, to: string): string[] | string {
  const a = from.trim();
  const b = to.trim();
  let values: string[];
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const start = Number(a);
    const end = Number(b);
    if (end < start) return "“To” must be bigger than “From”";
    if (end - start + 1 > MAX_PER_ADD) return `Add at most ${MAX_PER_ADD} at a time`;
    // Keep zero-padding if the user typed it ("01" → 01, 02 … 10).
    const width = a.startsWith("0") ? a.length : 0;
    values = Array.from({ length: end - start + 1 }, (_, i) => String(start + i).padStart(width, "0"));
  } else if (/^[a-z]$/i.test(a) && /^[a-z]$/i.test(b)) {
    const start = a.toUpperCase().charCodeAt(0);
    const end = b.toUpperCase().charCodeAt(0);
    if (end < start) return "“To” must come after “From”";
    const lower = a === a.toLowerCase();
    values = Array.from({ length: end - start + 1 }, (_, i) => String.fromCharCode(start + i)).map((c) =>
      lower ? c.toLowerCase() : c,
    );
  } else {
    return "Use numbers (1 to 6) or single letters (A to D)";
  }
  return values.map((v) => `${prefix}${v}`.trim());
}

function AddLocationsForm({ parent, onDone }: { parent: Location | null; onDone: () => void }) {
  const types = LOCATION_CHILD_TYPES[parent?.type ?? "ROOT"];
  const [type, setType] = useState<LocationType>(types[0]);
  const initial = rangeDefaults(types[0], parent);
  const [several, setSeveral] = useState(initial.several);
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState(initial.prefix);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function changeType(next: LocationType) {
    const d = rangeDefaults(next, parent);
    setType(next);
    setSeveral(d.several);
    setPrefix(d.prefix);
    setFrom(d.from);
    setTo(d.to);
  }

  const names = several ? rangeNames(prefix, from, to) : [name.trim()].filter(Boolean);
  const label = LOCATION_TYPE_LABELS[type].toLowerCase();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (typeof names === "string") return setError(names);
    if (!names.length) return setError("Enter a name");
    setSaving(true);
    setError("");
    try {
      await api("/locations", { method: "POST", body: { parentId: parent?.id, type, names } });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      {parent && (
        <p className="text-sm text-muted">
          Inside <strong className="text-ink">{parent.path}</strong>
        </p>
      )}

      {types.length > 1 && (
        <Field label="What are you adding?">
          {(id) => (
            <Select id={id} value={type} onChange={(e) => changeType(e.target.value as LocationType)}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {LOCATION_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {type !== "SITE" && (
        <div className="flex gap-1 rounded-lg bg-surface p-1 text-sm" role="tablist">
          {[false, true].map((s) => (
            <button
              key={String(s)}
              type="button"
              role="tab"
              aria-selected={several === s}
              onClick={() => setSeveral(s)}
              className={`min-h-10 flex-1 rounded-md font-medium ${several === s ? "bg-white text-ink shadow-sm" : "text-muted"}`}
            >
              {s ? `Several ${label}s` : `One ${label}`}
            </button>
          ))}
        </div>
      )}

      {several ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Starts with">{(id) => <Input id={id} value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={50} />}</Field>
            <Field label="From">{(id) => <Input id={id} value={from} onChange={(e) => setFrom(e.target.value)} required />}</Field>
            <Field label="To">{(id) => <Input id={id} value={to} onChange={(e) => setTo(e.target.value)} required />}</Field>
          </div>
          <p className="text-sm text-muted">
            {typeof names === "string" ? (
              <span className="text-danger">{names}</span>
            ) : (
              <>
                Will add {names.length}: <span className="text-ink">{preview(names)}</span>
              </>
            )}
          </p>
        </>
      ) : (
        <Field label="Name">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={PLACEHOLDERS[type]}
              required
              autoFocus
              maxLength={60}
            />
          )}
        </Field>
      )}

      <Button type="submit" disabled={saving}>
        {saving ? "Adding…" : typeof names !== "string" && names.length > 1 ? `Add ${names.length} ${label}s` : `Add ${label}`}
      </Button>
    </form>
  );
}

function preview(names: string[]): string {
  return names.length <= 6 ? names.join(", ") : `${names.slice(0, 3).join(", ")} … ${names.slice(-2).join(", ")}`;
}

// ------------------------------------------------------------------ rename

function RenameForm({ location, onDone }: { location: Location; onDone: () => void }) {
  const [name, setName] = useState(location.name);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(`/locations/${location.id}`, { method: "PATCH", body: { name } });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <p className="text-sm text-muted">
        The label code <span className="font-mono text-ink">{location.code}</span> stays the same, so printed labels keep working.
      </p>
      <Field label="Name">
        {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} required autoFocus maxLength={60} />}
      </Field>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
