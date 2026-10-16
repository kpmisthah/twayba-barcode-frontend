"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { ReportInfo } from "@/lib/types";

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportInfo[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ReportInfo[]>("/reports").then(setReports).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!reports) return <Spinner />;
  const groups = [...new Set(reports.map((r) => r.group))];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Reports" description="Filter by date, product, location, person or category — and download any report as Excel." />
      <div className="flex flex-col gap-6">
        {groups.map((g) => (
          <section key={g}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{g}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {reports
                .filter((r) => r.group === g)
                .map((r) => (
                  <Link key={r.type} href={`/reports/${r.type}`} className="rounded-xl border border-line bg-white p-4 hover:border-brand">
                    <p className="font-semibold text-ink">{r.title}</p>
                    <p className="mt-1 text-sm text-muted">{r.description}</p>
                  </Link>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
