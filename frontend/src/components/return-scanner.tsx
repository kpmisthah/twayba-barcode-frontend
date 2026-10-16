"use client";

import { useEffect, useMemo, useState } from "react";
import { LocationPicker } from "@/components/location-picker";
import { Alert, Field, Input, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { scanError, scanSuccess } from "@/lib/feedback";
import { stockableLocations } from "@/lib/stock";
import type { Location, Order, ReturnCondition } from "@/lib/types";

/** Items still on the van (cancelled, failed or partly refused order) go back into stock only by scanning them. */
export function ReturnScanner({ order, onChange }: { order: Order; onChange: (o: Order) => void }) {
  const { user } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [condition, setCondition] = useState<ReturnCondition>("GOOD");
  const [locationId, setLocationId] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    api<Location[]>("/locations").then(setLocations).catch(() => undefined);
  }, []);
  const options = useMemo(() => stockableLocations(locations, user).map((location) => ({ location })), [locations, user]);

  async function scan(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim();
    setCode("");
    if (!value) return;
    try {
      const res = await api<{ item: string; remaining: number; order: Order }>(`/orders/${order.id}/return-scan`, {
        method: "POST",
        body: { code: value, condition, locationId: condition === "GOOD" ? locationId : undefined },
      });
      scanSuccess();
      setMessage({ kind: "success", text: `${res.item} returned${condition === "DAMAGED" ? " as damaged" : ""}. ${res.remaining} left to return.` });
      onChange(res.order);
    } catch (err) {
      scanError();
      setMessage({ kind: "error", text: err instanceof ApiError || err instanceof Error ? err.message : "Could not return" });
    }
  }

  return (
    <section className="mt-6 flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
      <h2 className="font-semibold text-ink">Return loaded items ({order.inTransit} still In Transit)</h2>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      <Field label="Condition">
        {(id) => (
          <Select id={id} value={condition} onChange={(e) => setCondition(e.target.value as ReturnCondition)}>
            <option value="GOOD">Good — back to stock</option>
            <option value="DAMAGED">Damaged</option>
          </Select>
        )}
      </Field>
      {condition === "GOOD" && <LocationPicker label="Put back in" options={options} value={locationId} onChange={setLocationId} />}
      <form onSubmit={scan}>
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan each item as it comes off the van" autoComplete="off" aria-label="Scan returned item" disabled={condition === "GOOD" && !locationId} />
      </form>
    </section>
  );
}
