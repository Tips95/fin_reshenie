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
            <h1 className="text-base font-semibold text-slate-900">{APP_NAME}</h1>
            <p className="text-xs text-slate-500">Выберите контур и войдите</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setWorkspace("legal")}
            className={`rounded border px-2 py-1.5 text-xs font-medium ${
              workspace === "legal"
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Юрфирма
          </button>
          <button
            type="button"
            onClick={() => setWorkspace("retail")}
            className={`rounded border px-2 py-1.5 text-xs font-medium ${
              workspace === "retail"
                ? "border-slate-700 bg-slate-700 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Товарная рассрочка
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-slate-600">
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
            <label className="mb-0.5 block text-xs font-medium text-slate-600">Пароль</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="rounded border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs text-rose-800">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Вход..." : "Войти"}
          </Button>
        </form>

        <p className="mt-3 text-[11px] text-slate-500">
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
