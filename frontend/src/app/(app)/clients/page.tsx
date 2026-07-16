"use client";

import { Suspense } from "react";

import ClientsPageContent from "./ClientsPageContent";

export default function ClientsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Загрузка...</p>}>
      <ClientsPageContent />
    </Suspense>
  );
}
