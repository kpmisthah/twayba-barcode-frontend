"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ItemPicker } from "@/components/item-picker";
import { PageHeader } from "@/components/page-header";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { mapsUrl, parsePin } from "@/lib/maps";
import { itemLabel, type PickedItem } from "@/lib/stock";
import { PAYMENT_STATUS_LABELS, type Order, type OrderPayment } from "@/lib/types";

export default function NewOrderPage() {
  const router = useRouter();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [pinText, setPinText] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<OrderPayment>("UNPAID");
  const [codAmount, setCodAmount] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [timeWindow, setTimeWindow] = useState("");
  const [lines, setLines] = useState<{ item: PickedItem; quantity: number }[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const pin = pinText ? parsePin(pinText) : null;

  function addItem(item: PickedItem | null) {
    if (!item) return;
    if (item.kind === "COMPONENT") return setError("Choose the complete kit, not a single box");
    setError("");
    setLines((ls) => {
      const existing = ls.find((l) => l.item.variantId === item.variantId);
      return existing ? ls.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { item, quantity: 1 }];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!lines.length) return setError("Add at least one item");
    if (pinText && !pin) return setError("The map pin isn't a Google Maps link or “latitude, longitude”");
    setSaving(true);
    setError("");
    try {
      const order = await api<Order>("/orders", {
        method: "POST",
        body: {
          customerName,
          customerPhone: customerPhone || undefined,
          address: address || undefined,
          latitude: pin?.latitude,
          longitude: pin?.longitude,
          notes: notes || undefined,
          paymentStatus,
          codAmount: paymentStatus === "COD" && codAmount ? Number(codAmount) : undefined,
          deliveryDate: deliveryDate || undefined,
          timeWindow: timeWindow || undefined,
          lines: lines.map((l) => ({ variantId: l.item.variantId, quantity: l.quantity })),
        },
      });
      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the order");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/orders" className="mb-4 inline-block text-sm text-brand">
        ← Orders
      </Link>
      <PageHeader title="New order" />
      <form onSubmit={submit} className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}

        <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
          <h2 className="font-semibold text-ink">Customer</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">{(id) => <Input id={id} value={customerName} onChange={(e) => setCustomerName(e.target.value)} required maxLength={100} />}</Field>
            <Field label="Mobile">{(id) => <Input id={id} type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} maxLength={30} />}</Field>
          </div>
          <Field label="Delivery address">{(id) => <Input id={id} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} />}</Field>
          <Field label="Map pin (optional)" hint="Paste a Google Maps link, or type “35.909, 14.426”">
            {(id) => <Input id={id} value={pinText} onChange={(e) => setPinText(e.target.value)} placeholder="https://maps.google.com/…" />}
          </Field>
          {pin && (
            <a href={mapsUrl(pin.latitude, pin.longitude)} target="_blank" rel="noreferrer" className="-mt-2 text-sm text-brand">
              📍 {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)} — check on the map
            </a>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Delivery date">{(id) => <Input id={id} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />}</Field>
            <Field label="Time window">{(id) => <Input id={id} value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)} placeholder="e.g. 14:00–17:00" maxLength={50} />}</Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment">
              {(id) => (
                <Select id={id} value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as OrderPayment)}>
                  {(Object.keys(PAYMENT_STATUS_LABELS) as OrderPayment[]).map((p) => (
                    <option key={p} value={p}>
                      {PAYMENT_STATUS_LABELS[p]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {paymentStatus === "COD" && (
              <Field label="Amount to collect (€)">
                {(id) => <Input id={id} type="number" inputMode="decimal" min={0} step="0.01" value={codAmount} onChange={(e) => setCodAmount(e.target.value)} required />}
              </Field>
            )}
          </div>
          <Field label="Notes for the driver">{(id) => <Input id={id} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="e.g. 3rd floor, no lift" />}</Field>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
          <h2 className="font-semibold text-ink">Items</h2>
          <ItemPicker value={null} onChange={addItem} />
          {lines.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {lines.map((l, i) => (
                <li key={l.item.variantId} className="flex items-center gap-3 p-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{itemLabel(l.item)}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={l.quantity}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))}
                    className="h-10 min-h-10! w-20!"
                    aria-label={`Quantity of ${itemLabel(l.item)}`}
                  />
                  <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-sm text-danger">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Button type="submit" disabled={saving} className="min-h-12">
          {saving ? "Creating…" : "Create order"}
        </Button>
      </form>
    </div>
  );
}
