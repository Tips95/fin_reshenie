"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  BrandFooter,
  Button,
  Card,
  FormField,
  Input,
  LogoLockup,
} from "@/components/ui";
import {
  collectErrors,
  hasErrors,
  normalizeLoginValue,
  validateLogin,
  validatePassword,
} from "@/lib/validation";
import { getAuthErrorMessage, useAuth } from "@/modules/auth/AuthProvider";

const HINT =
  "Вы становитесь руководителем компании: сотрудников добавите сами в разделе «Команда». Данные компаний не пересекаются.";

function RegisterForm() {
  const { user, loading, register } = useAuth();
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const errors = collectErrors({
      organizationName: organizationName.trim().length < 2 ? "Укажите название компании" : null,
      loginValue: validateLogin(loginValue),
      password: validatePassword(password),
      passwordRepeat: password !== passwordRepeat ? "Пароли не совпадают" : null,
    });
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setSubmitting(true);
    try {
      await register({
        organizationName: organizationName.trim(),
        login: normalizeLoginValue(loginValue),
        password,
        fullName,
      });
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <div className="mb-4 space-y-2">
        <LogoLockup />
        <p className="text-center text-xs text-muted">Регистрация компании</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Название компании" error={fieldErrors.organizationName}>
          <Input
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            placeholder="ООО «Ваша компания»"
            required
          />
        </FormField>
        <FormField label="Email или телефон · это логин" error={fieldErrors.loginValue}>
          <Input
            value={loginValue}
            onChange={(e) => setLoginValue(e.target.value)}
            placeholder="director@company.ru"
            required
          />
        </FormField>
        <FormField label="Пароль" error={fieldErrors.password}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Пароль ещё раз" error={fieldErrors.passwordRepeat}>
          <Input
            type="password"
            value={passwordRepeat}
            onChange={(e) => setPasswordRepeat(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Ваше имя · необязательно">
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Иванов Иван"
          />
        </FormField>

        {error && (
          <p className="alert-danger px-2 py-1.5 text-xs">{error}</p>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Создаём компанию..." : "Зарегистрировать"}
        </Button>
      </form>

      <p className="mt-3 text-center text-xs text-muted">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="link-brand font-medium">
          Войти
        </Link>
      </p>

      <p className="mt-3 text-[11px] text-muted">{HINT}</p>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <div className="auth-page relative flex min-h-screen items-center justify-center px-4 py-6">
      <RegisterForm />

      <div className="absolute bottom-3 left-0 right-0">
        <BrandFooter onDark />
      </div>
    </div>
  );
}
