"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/types";

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  const shortcuts = navFor(user.role).filter((item) => item.href !== "/");

  return (
    <>
      <PageHeader title={`Hello, ${user.name}`} description={`${ROLE_LABELS[user.role]} · ${ROLE_DESCRIPTIONS[user.role]}`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-line bg-white p-5 font-medium text-ink shadow-sm hover:border-brand"
          >
            {item.label}
          </Link>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted">Stock, sales and order figures will appear here as those modules are added.</p>
    </>
  );
}
