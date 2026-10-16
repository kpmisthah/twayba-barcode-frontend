"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraScanner } from "@/components/camera-scanner";
import { Icon } from "@/components/icons";
import { ItemPicker } from "@/components/item-picker";
import { Thumb } from "@/components/thumb";
import { Alert, Badge, Button, Input, Modal, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { downloadPdf, openPdf } from "@/lib/download";
import { scanError, scanSuccess } from "@/lib/feedback";
import { formatMoney, useSettings } from "@/lib/settings";
import { useAuth } from "@/lib/auth";
import { canUseSite, lookupCode, type PickedItem } from "@/lib/stock";
import type { Location, Product, Sale, SalePreview } from "@/lib/types";
import {
  addBox,
  addItem,
  boxDone,
  kitComplete,
  lineQuantity,
  newKit,
  removeOne,
  toSaleLines,
  type CartLine,
  type KitLine,
  type Pick,
} from "./cart";
import { Checkout, type CheckoutResult } from "./checkout";
import { SpaceChooser } from "./space-chooser";

const SITE_KEY = "twayba.pos.site";

type KitTemplate = Omit<KitLine, "key" | "kind" | "discountPercent">;

type SpaceTarget =
  | { type: "item"; item: PickedItem }
  | { type: "box"; kit: KitTemplate; boxVariantId: string; boxName: string; lineKey?: string };

type Dialog = { kind: "space"; target: SpaceTarget } | { kind: "checkout" } | { kind: "done"; sale: Sale } | null;

export default function PosPage() {
  const settings = useSettings();
  const { user } = useAuth();
  const [sites, setSites] = useState<Location[] | null>(null);
  const [siteId, setSiteId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [preview, setPreview] = useState<SalePreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [scanText, setScanText] = useState("");
  const kitCache = useRef(new Map<string, KitTemplate>());
  // Camera scans arrive via a stable callback; it checks this to ignore scans while a dialog is open.
  const dialogOpen = useRef(false);
  useEffect(() => {
    dialogOpen.current = dialog !== null;
  }, [dialog]);

  const money = (v: string | number | undefined) => formatMoney(v === undefined ? undefined : String(v), settings?.currency);
  const site = sites?.find((s) => s.id === siteId);

  // Shops/sites; remember this device's choice.
  useEffect(() => {
    api<Location[]>("/locations")
      .then((all) => {
        const list = all.filter((l) => l.type === "SITE" && canUseSite(user, l.id));
        setSites(list);
        let saved = "";
        try {
          saved = localStorage.getItem(SITE_KEY) ?? "";
        } catch {
          // storage unavailable
        }
        const pick = list.find((s) => s.id === saved) ?? list.find((s) => /shop/i.test(s.name)) ?? list[0];
        if (pick) setSiteId(pick.id);
      })
      .catch((e) => setMessage({ kind: "error", text: e.message }));
  }, [user]);

  function chooseSite(id: string) {
    setSiteId(id);
    try {
      localStorage.setItem(SITE_KEY, id);
    } catch {
      // ignore
    }
  }

  // Price the cart on the server whenever items, quantities or discounts change.
  const priceKey = JSON.stringify(cart.map((l) => [l.variantId, lineQuantity(l), l.discountPercent]));
  useEffect(() => {
    const lines = JSON.parse(priceKey) as [string, number, number][];
    if (!lines.length) return;
    const timer = setTimeout(() => {
      api<SalePreview>("/sales/preview", {
        method: "POST",
        body: { lines: lines.map(([variantId, quantity, discountPercent]) => ({ variantId, quantity, discountPercent: discountPercent || undefined })) },
      })
        .then((p) => {
          setPreview(p);
          setPreviewError("");
        })
        .catch((e) => setPreviewError(e.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [priceKey]);
  const shownPreview = cart.length ? preview : null;

  async function kitTemplate(productId: string): Promise<KitTemplate> {
    const cached = kitCache.current.get(productId);
    if (cached) return cached;
    const p = await api<Product>(`/products/${productId}`);
    const kit = p.variants.find((v) => v.kind === "KIT");
    if (!kit) throw new Error(`${p.name} is not a kit`);
    const template: KitTemplate = {
      productId: p.id,
      variantId: kit.id,
      name: p.name,
      code: kit.code,
      image: p.images[0],
      boxes: kit.components.map((c) => ({
        variantId: c.componentVariant.id,
        name: c.componentVariant.name.split(" – ")[0],
        perKit: c.quantity,
        picks: [],
      })),
    };
    kitCache.current.set(productId, template);
    return template;
  }

  /** An item was scanned or chosen from search. */
  const handleItem = useCallback(async (item: PickedItem) => {
    setMessage(null);
    try {
      if (item.kind === "STANDARD") {
        setDialog({ kind: "space", target: { type: "item", item } });
      } else if (item.kind === "KIT") {
        const kit = await kitTemplate(item.productId);
        setCart((c) => newKit(c, kit));
        setMessage({ kind: "success", text: `${kit.name} added — now scan each box (or tap a box to choose its space).` });
      } else {
        const kit = await kitTemplate(item.productId);
        const box = kit.boxes.find((b) => b.variantId === item.variantId)!;
        setDialog({ kind: "space", target: { type: "box", kit, boxVariantId: box.variantId, boxName: box.name } });
      }
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Could not add the item" });
    }
  }, []);

  const handleCode = useCallback(
    async (code: string) => {
      if (dialogOpen.current || !code.trim()) return;
      try {
        const item = await lookupCode(code);
        scanSuccess();
        await handleItem(item);
      } catch (e) {
        scanError();
        setMessage({
          kind: "error",
          text: e instanceof ApiError && e.status === 404 ? `No item has the code "${code.trim()}"` : e instanceof Error ? e.message : "Lookup failed",
        });
      }
    },
    [handleItem],
  );

  function onSpacePicked(target: SpaceTarget, pick: Pick) {
    if (target.type === "item") {
      const i = target.item;
      setCart((c) => addItem(c, { productId: i.productId, variantId: i.variantId, name: itemName(i), code: i.code, image: i.image }, pick));
    } else {
      setCart((c) => addBox(c, target.kit, target.boxVariantId, pick, target.lineKey));
    }
    setDialog(null);
  }

  const setDiscount = (key: string, value: string) => {
    const pct = Math.min(100, Math.max(0, Number(value) || 0));
    setCart((c) => c.map((l) => (l.key === key ? { ...l, discountPercent: pct } : l)));
  };

  async function completeSale(result: CheckoutResult) {
    const sale = await api<Sale>("/sales", {
      method: "POST",
      body: { siteId, lines: toSaleLines(cart), ...result },
    });
    setCart([]);
    setPreview(null);
    setMessage(null);
    setDialog({ kind: "done", sale });
  }

  const incomplete = cart.filter((l): l is KitLine => l.kind === "KIT" && !kitComplete(l));
  const canCharge = cart.length > 0 && !!shownPreview && !previewError && incomplete.length === 0 && !!site;

  if (!sites) return <Spinner />;
  if (sites.length === 0) return <Alert>Add your shop as a site on the Locations page before selling.</Alert>;

  return (
    <div className="mx-auto max-w-3xl pb-40">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">Sell</h1>
        <label className="flex items-center gap-2 text-sm text-muted">
          Selling from
          <Select value={siteId} onChange={(e) => chooseSite(e.target.value)} className="w-auto!" disabled={cart.length > 0} aria-label="Shop">
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {/* Add items */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCode(scanText);
            setScanText("");
          }}
          className="flex gap-2"
        >
          <Input
            value={scanText}
            onChange={(e) => setScanText(e.target.value)}
            placeholder="Scan barcode (USB scanner) or type a code + Enter"
            autoComplete="off"
            enterKeyHint="go"
            aria-label="Scan code"
          />
          <Button type="button" variant="secondary" onClick={() => setShowCamera((v) => !v)} aria-pressed={showCamera}>
            <Icon name="scan" />
            <span className="sr-only">Camera</span>
          </Button>
        </form>
        {showCamera && <CameraScanner onScan={handleCode} />}
        <details>
          <summary className="cursor-pointer text-sm text-brand">Search by name instead</summary>
          <div className="mt-2">
            <ItemPicker value={null} onChange={(item) => item && handleItem(item)} camera={false} />
          </div>
        </details>
      </div>

      {message && (
        <div className="mb-4">
          <Alert kind={message.kind}>{message.text}</Alert>
        </div>
      )}
      {previewError && (
        <div className="mb-4">
          <Alert>{previewError}</Alert>
        </div>
      )}

      {/* Cart */}
      {cart.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-white/60 p-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <Icon name="scan" className="size-6" />
          </span>
          <p className="font-medium text-ink">Scan an item to start a sale</p>
          <p className="text-sm text-muted">Use a barcode scanner, the camera button, or search by name.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {cart.map((line, index) => {
            const priced = shownPreview?.lines[index];
            return (
              <li key={line.key} className="p-4">
                <div className="flex gap-3">
                  <Thumb src={line.image} size="size-12" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{line.name}</p>
                        {line.kind === "STANDARD" && (
                          <p className="text-xs text-muted">{line.picks.map((p) => `${p.quantity} × ${p.where}`).join(" · ")}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums text-ink">{priced ? money(priced.total) : "…"}</p>
                        {priced && Number(priced.discount) > 0 && <p className="text-xs text-muted line-through">{money(priced.gross)}</p>}
                      </div>
                    </div>

                    {line.kind === "KIT" && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {line.boxes.map((b) => (
                          <li key={b.variantId}>
                            {boxDone(b) ? (
                              <p className="text-sm text-ok">
                                ✓ {b.name}
                                {b.perKit > 1 && ` ×${b.perKit}`} <span className="text-muted">· {b.picks.map((p) => p.where).join(", ")}</span>
                              </p>
                            ) : (
                              <button
                                type="button"
                                className="text-sm text-danger hover:underline"
                                onClick={() =>
                                  setDialog({
                                    kind: "space",
                                    target: {
                                      type: "box",
                                      kit: { productId: line.productId, variantId: line.variantId, name: line.name, code: line.code, image: line.image, boxes: line.boxes.map((x) => ({ ...x, picks: [] })) },
                                      boxVariantId: b.variantId,
                                      boxName: b.name,
                                      lineKey: line.key,
                                    },
                                  })
                                }
                              >
                                ○ {b.name} — scan it or tap to choose its space
                                {b.perKit > 1 && ` (${b.picks.reduce((s, p) => s + p.quantity, 0)}/${b.perKit})`}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {line.kind === "STANDARD" ? (
                        <div className="flex items-center rounded-lg border border-line">
                          <button type="button" className="size-10 text-lg text-ink" onClick={() => setCart((c) => removeOne(c, line.key))} aria-label="One less">
                            −
                          </button>
                          <span className="min-w-8 text-center font-semibold tabular-nums">{lineQuantity(line)}</span>
                          <button
                            type="button"
                            className="size-10 text-lg text-ink"
                            aria-label="One more"
                            onClick={() =>
                              setDialog({
                                kind: "space",
                                target: { type: "item", item: { productId: line.productId, productName: line.name, variantId: line.variantId, variantName: "Default", kind: "STANDARD", code: line.code, image: line.image } },
                              })
                            }
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        !kitComplete(line) && <Badge tone="brand">Incomplete kit</Badge>
                      )}
                      <label className="flex items-center gap-1 text-sm text-muted">
                        Discount
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={100}
                          step="0.5"
                          value={line.discountPercent || ""}
                          placeholder="0"
                          onChange={(e) => setDiscount(line.key, e.target.value)}
                          className="h-10 min-h-10! w-20!"
                          aria-label={`Discount % for ${line.name}`}
                        />
                        %
                      </label>
                      <button type="button" onClick={() => setCart((c) => c.filter((l) => l.key !== line.key))} className="ml-auto text-sm text-danger hover:underline">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Totals + charge (stays at the bottom of the screen) */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(21,27,46,0.08)] backdrop-blur-md sm:px-6 lg:bottom-0 lg:left-64 lg:px-10">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <div className="text-sm text-muted">
              {shownPreview ? (
                <>
                  {Number(shownPreview.totals.discount) > 0 && <p>Discount −{money(shownPreview.totals.discount)}</p>}
                  <p>VAT {money(shownPreview.totals.tax)}</p>
                  <p className="text-2xl font-semibold tabular-nums text-ink">{money(shownPreview.totals.total)}</p>
                </>
              ) : (
                <Spinner />
              )}
            </div>
            <Button onClick={() => setDialog({ kind: "checkout" })} disabled={!canCharge} className="min-h-14 px-8 text-base">
              {incomplete.length ? "Scan all boxes first" : "Charge"}
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <Modal
        title={dialog?.kind === "space" ? `Taken from which space? — ${dialog.target.type === "item" ? itemName(dialog.target.item) : `${dialog.target.kit.name}, ${dialog.target.boxName}`}` : ""}
        open={dialog?.kind === "space"}
        onClose={() => setDialog(null)}
      >
        {dialog?.kind === "space" && site && (
          <SpaceChooser
            productId={dialog.target.type === "item" ? dialog.target.item.productId : dialog.target.kit.productId}
            variantId={dialog.target.type === "item" ? dialog.target.item.variantId : dialog.target.boxVariantId}
            site={site}
            cart={cart}
            onPick={(pick) => onSpacePicked(dialog.target, pick)}
          />
        )}
      </Modal>
      <Modal title="Payment" open={dialog?.kind === "checkout"} onClose={() => setDialog(null)}>
        {dialog?.kind === "checkout" && shownPreview && (
          <Checkout
            total={shownPreview.totals.total}
            currency={settings?.currency}
            needsApproval={shownPreview.needsApproval}
            maxDiscountPercent={shownPreview.maxDiscountPercent}
            onComplete={completeSale}
          />
        )}
      </Modal>
      <Modal title="Sale complete" open={dialog?.kind === "done"} onClose={() => setDialog(null)}>
        {dialog?.kind === "done" && <SaleDone sale={dialog.sale} money={money} onNew={() => setDialog(null)} />}
      </Modal>
    </div>
  );
}

function itemName(i: PickedItem) {
  return i.variantName === "Default" ? i.productName : `${i.productName} – ${i.variantName}`;
}

function SaleDone({ sale, money, onNew }: { sale: Sale; money: (v: string) => string; onNew: () => void }) {
  const [error, setError] = useState("");
  const run = (fn: () => Promise<void>) => fn().catch((e) => setError(e instanceof Error ? e.message : "Could not get the PDF"));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-ok/10 p-4 text-center">
        <p className="text-sm text-ok">✓ Paid — invoice {sale.invoiceNumber}</p>
        <p className="text-3xl font-semibold tabular-nums text-ink">{money(sale.total)}</p>
        {Number(sale.changeGiven) > 0 && (
          <p className="mt-2 text-lg font-semibold text-ink">
            Change to give: <span className="tabular-nums">{money(sale.changeGiven)}</span>
          </p>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" onClick={() => run(() => downloadPdf(`/sales/${sale.id}/invoice`, `${sale.invoiceNumber}.pdf`))}>
          ⬇ Download invoice (PDF)
        </Button>
        <Button variant="secondary" onClick={() => run(() => openPdf(`/sales/${sale.id}/receipt`))}>
          🧾 Print receipt
        </Button>
      </div>
      <Button onClick={onNew} className="min-h-14 text-base">
        New sale
      </Button>
    </div>
  );
}
