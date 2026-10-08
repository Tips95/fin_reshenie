"use client";

import { useEffect } from "react";

import { Button, Card, PageHeader } from "@/components/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-stack">
      <PageHeader title="Что-то пошло не так" subtitle="Раздел не удалось отобразить" />
      <Card>
        <p className="text-sm text-muted">
          Попробуйте обновить страницу. Данные в базе не затронуты.
        </p>
        <div className="mt-3">
          <Button type="button" onClick={reset}>
            Повторить
          </Button>
        </div>
      </Card>
    </div>
  );
}
