"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { MovementList } from "@/components/stock";
import { Field, Select } from "@/components/ui";
import { MOVEMENT_LABELS, type MovementType } from "@/lib/types";

export default function StockHistoryPage() {
  const [type, setType] = useState<MovementType | "">("");

  return (
    <div>
      <PageHeader
        title="Stock history"
        description="Every stock change: what, how many, from where to where, who and when. History can't be edited or deleted."
      />
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-4 shadow-sm">
        <div className="w-full sm:w-64">
          <Field label="Show">
            {(id) => (
              <Select id={id} value={type} onChange={(e) => setType(e.target.value as MovementType | "")}>
                <option value="">All movements</option>
                {(Object.keys(MOVEMENT_LABELS) as MovementType[]).map((t) => (
                  <option key={t} value={t}>
                    {MOVEMENT_LABELS[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
      <MovementList filter={{ type: type || undefined }} />
    </div>
  );
}
