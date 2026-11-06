"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  BrandFooter,
  Button,
  Card,
  FormField,
  Input,
  LoadingState,
  LogoLockup,
  PhoneInput,
} from "@/components/ui";
import { ApiRequestError, authApi } from "@/lib/api-client";
import { PHONE_PREFIX } from "@/lib/phone";
import {
  collectErrors,
  filterPersonName,
  hasErrors,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
} from "@/lib/validation";
import { AGENT_TERMS_VERSION, AgentTermsText } from "@/modules/agents/AgentTerms";
import { useAuth } from "@/modules/auth/AuthProvider";

function JoinForm({ organizationName }: { organizationName: string }) {
  const { registerAgent } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState(PHONE_PREFIX);
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState("");
  const [inn, setInn] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const innDigits = inn.replace(/\D/g, "");
    const errors = collectErrors({
      fullName: validateFullName(fullName),
      phone: validatePhone(phone),
      email: email.trim() ? validateEmail(email) : null,
      inn:
        innDigits && innDigits.length !== 10 && innDigits.length !== 12
          ? "ИНН — 10 или 12 цифр"
          : null,
      password: validatePassword(password),
      passwordRepeat: password !== passwordRepeat ? "Пароли не совпадают" : null,
      acceptTerms: acceptTerms ? null : "Чтобы начать работу, примите соглашение",
    });
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setSubmitting(true);
    try {
      await registerAgent({
        full_name: fullName.trim().replace(/\s+/g, " "),
        phone: phone.trim(),
        email: email.trim() || null,
        telegram: telegram.trim() || null,
        inn: innDigits || null,
        password,
        accept_terms: acceptTerms,
        terms_version: AGENT_TERMS_VERSION,
      });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось зарегистрироваться");
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <div className="mb-4 space-y-2">
        <LogoLockup />
        <p className="text-center text-xs text-muted">
          Удалённый менеджер · <span className="font-semibold">{organizationName}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="ФИО" error={fieldErrors.fullName} required>
          <Input
            value={fullName}
            onChange={(e) => setFullName(filterPersonName(e.target.value))}
            placeholder="Иванов Иван"
          />
        </FormField>
        <FormField label="Телефон · это логин" error={fieldErrors.phone} required>
          <PhoneInput value={phone} onValueChange={setPhone} />
        </FormField>
        <FormField label="Email · необязательно" error={fieldErrors.email}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Telegram · чтобы куратор мог написать" error={fieldErrors.telegram}>
          <Input
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            placeholder="@ivanov"
          />
        </FormField>
        <FormField label="ИНН · для выплат, можно позже" error={fieldErrors.inn}>
          <Input inputMode="numeric" value={inn} onChange={(e) => setInn(e.target.value)} />
        </FormField>
        <FormField label="Пароль" error={fieldErrors.password} required>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <FormField label="Пароль ещё раз" error={fieldErrors.passwordRepeat} required>
          <Input
            type="password"
            value={passwordRepeat}
            onChange={(e) => setPasswordRepeat(e.target.value)}
          />
        </FormField>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold">Пользовательское соглашение</p>
            <Link
              href="/agent-terms"
              target="_blank"
              className="link-brand text-[11px] font-medium"
            >
              Открыть отдельно
            </Link>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-surface-muted px-3 py-2.5">
            <AgentTermsText company={organizationName} />
          </div>
        </div>
        <label className="flex items-start gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
          />
          Я прочитал(а) и принимаю пользовательское соглашение, в том числе согласие на обработку
          моих персональных данных
        </label>
        {fieldErrors.acceptTerms ? (
          <p className="text-[11px] text-status-danger-text">{fieldErrors.acceptTerms}</p>
        ) : null}

        {error && <p className="alert-danger px-2 py-1.5 text-xs">{error}</p>}

        <Button type="submit" className="w-full" disabled={submitting || !acceptTerms}>
          {submitting ? "Регистрируем..." : "Принять и начать работу"}
        </Button>
      </form>

      <p className="mt-3 text-center text-xs text-muted">
        Уже зарегистрированы?{" "}
        <Link href="/login" className="link-brand font-medium">
          Войти
        </Link>
      </p>
    </Card>
  );
}

export default function JoinPage() {
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const info = await authApi.agentSignup();
        if (info.open && info.organization_name) {
          setOrganizationName(info.organization_name);
        } else {
          setError("Регистрация удалённых менеджеров сейчас закрыта.");
        }
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Не удалось открыть регистрацию");
      }
    })();
  }, []);

  return (
    <div className="auth-page relative flex min-h-screen items-center justify-center px-4 py-6">
      {error ? (
        <Card className="w-full max-w-sm space-y-3">
          <LogoLockup />
          <p className="alert-danger px-2 py-1.5 text-xs">{error}</p>
          <Link href="/login" className="link-brand block text-center text-sm font-medium">
            Ко входу
          </Link>
        </Card>
      ) : organizationName ? (
        <JoinForm organizationName={organizationName} />
      ) : (
        <LoadingState text="Загрузка..." />
      )}

      <div className="absolute bottom-3 left-0 right-0">
        <BrandFooter onDark />
      </div>
    </div>
  );
}
