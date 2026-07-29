"use client";

import { Suspense } from "react";

import ClientsPageContent from "../ClientsPageContent";

export default function ClientsContractsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Загрузка...</p>}>
      <ClientsPageContent workspace="contracts" />
    </Suspense>
  );
}
