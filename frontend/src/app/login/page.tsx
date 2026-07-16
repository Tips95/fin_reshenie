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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 mesh-bg">
      <Card variant="glass" className="relative w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{APP_NAME}</h1>
            <p className="text-sm text-slate-500">Выберите контур и войдите в систему</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setWorkspace("legal")}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              workspace === "legal"
                ? "bg-brand-700 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Юрфирма
          </button>
          <button
            type="button"
            onClick={() => setWorkspace("retail")}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              workspace === "retail"
                ? "bg-emerald-700 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Товарная рассрочка
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
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
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Пароль</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Вход..." : "Войти"}
          </Button>
        </form>

        <p className="mt-4 text-xs text-slate-500">
          {workspace === "legal"
            ? "Демо: admin@reshenie.local / admin123"
            : "Админ: admin@retail.local / admin123 · Инвестор: investor1@retail.local / investor123"}
        </p>
      </Card>

      <div className="absolute bottom-6 left-0 right-0">
        <BrandFooter />
      </div>
    </div>
  );
}
