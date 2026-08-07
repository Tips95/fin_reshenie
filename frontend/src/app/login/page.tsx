"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Link from "next/link";

import { BrandFooter, Button, Card, Input, LogoLockup, WorkspaceSwitch } from "@/components/ui";
import type { Workspace } from "@/lib/types";
import { normalizeLoginValue, validateLogin } from "@/lib/validation";
import { WORKSPACE_LABELS, resolveWorkspace, setStoredWorkspace } from "@/lib/workspace";
import { useAuth, getAuthErrorMessage } from "@/modules/auth/AuthProvider";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace>(() => resolveWorkspace());
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace(user.organization_type === "retail" ? "/retail" : "/");
    }
  }, [loading, user, router]);

  function changeWorkspace(next: Workspace) {
    setWorkspace(next);
    setStoredWorkspace(next);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const loginError = validateLogin(loginValue);
    if (loginError) {
      setError(loginError);
      setSubmitting(false);
      return;
    }
    try {
      setStoredWorkspace(workspace);
      await login(normalizeLoginValue(loginValue), password, workspace);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page relative flex min-h-screen items-center justify-center px-4 py-6">
      <Card className="w-full max-w-sm">
        <div className="mb-4 space-y-2">
          <LogoLockup />
          <p className="text-center text-xs text-muted">
            Вход в контур «{WORKSPACE_LABELS[workspace]}»
          </p>
        </div>

        <div className="mb-4">
          <WorkspaceSwitch value={workspace} onChange={changeWorkspace} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-muted">
              Email или телефон
            </label>
            <Input
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              placeholder="email@company.ru"
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
          {error && (
            <p className="alert-danger px-2 py-1.5 text-xs">
              {error} · контур «{WORKSPACE_LABELS[workspace]}»
            </p>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Вход..." : "Войти"}
          </Button>
        </form>

        <p className="mt-3 text-center text-xs text-muted">
          Нет аккаунта?{" "}
          <Link href={`/register?workspace=${workspace}`} className="link-brand font-medium">
            Зарегистрировать компанию
          </Link>
        </p>
      </Card>

      <div className="absolute bottom-3 left-0 right-0">
        <BrandFooter onDark />
      </div>
    </div>
  );
}
