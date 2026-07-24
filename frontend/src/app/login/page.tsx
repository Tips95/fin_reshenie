"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BrandFooter, Button, Card, Input, LogoMark } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";
import type { Workspace } from "@/lib/types";
import { useAuth, getAuthErrorMessage } from "@/modules/auth/AuthProvider";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace>("legal");
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace(user.organization_type === "retail" ? "/retail" : "/");
    }
  }, [loading, user, router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(loginValue, password, workspace);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-6 mesh-bg">
      <Card className="w-full max-w-sm">
        <div className="mb-4 flex items-center gap-2">
          <LogoMark />
          <div>
            <h1 className="text-base font-semibold text-foreground">{APP_NAME}</h1>
            <p className="text-xs text-muted">Выберите контур и войдите</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setWorkspace("legal")}
            className={
              workspace === "legal"
                ? "interactive rounded-md border border-brand-700 bg-brand-700 px-2 py-1.5 text-xs font-medium text-white shadow-soft hover:bg-brand-800"
                : "interactive rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium text-muted shadow-soft hover:border-border-strong hover:bg-surface-muted"
            }
          >
            Юрфирма
          </button>
          <button
            type="button"
            onClick={() => setWorkspace("retail")}
            className={
              workspace === "retail"
                ? "interactive rounded-md border border-brand-700 bg-brand-700 px-2 py-1.5 text-xs font-medium text-white shadow-soft hover:bg-brand-800"
                : "interactive rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium text-muted shadow-soft hover:border-border-strong hover:bg-surface-muted"
            }
          >
            Товарная рассрочка
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-muted">
              Email или телефон
            </label>
            <Input
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              placeholder={workspace === "legal" ? "admin@reshenie.local" : "admin@retail.local"}
              required
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-muted">Пароль</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="alert-danger px-2 py-1.5 text-xs">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Вход..." : "Войти"}
          </Button>
        </form>

        <p className="mt-3 text-[11px] text-muted">
          {workspace === "legal"
            ? "Демо: admin@reshenie.local / admin123"
            : "Админ: admin@retail.local / admin123 · Инвестор: investor1@retail.local / investor123"}
        </p>
      </Card>

      <div className="absolute bottom-3 left-0 right-0">
        <BrandFooter />
      </div>
    </div>
  );
}
