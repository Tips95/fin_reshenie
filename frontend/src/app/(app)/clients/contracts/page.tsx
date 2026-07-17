"use client";

import { Suspense } from "react";

import ClientsPageContent from "../ClientsPageContent";

export default function ClientsContractsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Загрузка...</p>}>
      <ClientsPageContent workspace="contracts" />
    </Suspense>
  );
}
