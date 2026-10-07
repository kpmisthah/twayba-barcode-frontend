"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(loginId, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">
            T
          </div>
          <h1 className="text-2xl font-semibold text-ink">Twayba Inventory</h1>
          <p className="mt-1 text-sm text-muted">Sign in with your own account</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6 shadow-sm">
          {error && <Alert>{error}</Alert>}
          <Field label="Email or phone">
            {(id) => (
              <Input
                id={id}
                autoComplete="username"
                inputMode="email"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
                autoFocus
              />
            )}
          </Field>
          <Field label="Password">
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            )}
          </Field>
          <Button type="submit" disabled={submitting} className="mt-2 w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
