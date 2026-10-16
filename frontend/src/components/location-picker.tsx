"use client";

import { useId, useState } from "react";
import { Input, Select } from "@/components/ui";
import type { Location } from "@/lib/types";

export interface LocationOption {
  location: Location;
  /** Shown after the name, e.g. "5 available". */
  hint?: string;
}

/**
 * Choose a location from a list grouped by site, or scan its label (the scanner types
 * LOC-000123 and presses Enter).
 */
export function LocationPicker({
  label,
  options,
  value,
  onChange,
  empty = "No locations available",
}: {
  label: string;
  options: LocationOption[];
  value: string;
  onChange: (locationId: string) => void;
  empty?: string;
}) {
  const id = useId();
  const [scan, setScan] = useState("");
  const [scanError, setScanError] = useState("");

  const sites = new Map<string, LocationOption[]>();
  for (const o of options) {
    const site = o.location.pathNames[0];
    sites.set(site, [...(sites.get(site) ?? []), o]);
  }

  function onScan() {
    const code = scan.trim().toUpperCase();
    if (!code) return;
    const hit = options.find((o) => o.location.code === code);
    if (hit) {
      onChange(hit.location.id);
      setScan("");
      setScanError("");
    } else {
      setScanError(`${code} can't be used here`);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {options.length === 0 ? (
        <p className="rounded-lg bg-surface px-3 py-2.5 text-sm text-muted">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} required className="sm:flex-1">
            <option value="">Choose…</option>
            {[...sites.entries()].map(([site, list]) => (
              <optgroup key={site} label={site}>
                {list.map((o) => (
                  <option key={o.location.id} value={o.location.id}>
                    {(o.location.pathNames.length > 1 ? o.location.pathNames.slice(1) : o.location.pathNames).join(" › ")}
                    {o.hint ? ` — ${o.hint}` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <Input
            value={scan}
            onChange={(e) => {
              setScan(e.target.value);
              setScanError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onScan();
              }
            }}
            placeholder="or scan label"
            autoComplete="off"
            aria-label={`${label}: scan location label`}
            className="sm:w-40!"
          />
        </div>
      )}
      {scanError && <p className="text-xs text-danger">{scanError}</p>}
    </div>
  );
}
