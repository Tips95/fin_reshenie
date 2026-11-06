"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BrandFooter, Button, Card, Input, LogoLockup } from "@/components/ui";
import { authApi } from "@/lib/api-client";
import { legalHomePath } from "@/lib/organization-features";
import { normalizeLoginValue, validateLogin } from "@/lib/validation";
import { useAuth, getAuthErrorMessage } from "@/modules/auth/AuthProvider";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [agentSignupOpen, setAgentSignupOpen] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace(legalHomePath(user));
    }
  }, [loading, user, router]);

  useEffect(() => {
    authApi
      .agentSignup()
      .then((info) => setAgentSignupOpen(info.open))
      .catch(() => setAgentSignupOpen(false));
  }, []);

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
      await login(normalizeLoginValue(loginValue), password);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page relative flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-[380px] rounded-2xl p-5 shadow-hover sm:p-6">
        <div className="mb-5 space-y-2.5">
          <LogoLockup />
          <p className="text-center text-sm font-semibold tracking-tight text-foreground">
            Вход в систему
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-semibold tracking-wide text-muted">
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
            <label className="mb-1 block text-xs font-semibold tracking-wide text-muted">
              Пароль
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="alert-danger text-xs">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? "Вход..." : "Войти"}
          </Button>
        </form>

        {agentSignupOpen ? (
          <div className="mt-5 space-y-2 border-t border-border pt-4">
            <p className="text-center text-xs text-muted">
              Хотите приводить клиентов и получать 5 000 ₽ за каждого?
            </p>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => router.push("/join")}
            >
              Стать удалённым менеджером
            </Button>
          </div>
        ) : null}
      </Card>

      <div className="absolute bottom-3 left-0 right-0">
        <BrandFooter onDark />
      </div>
    </div>
  );
}
