"use client";

import { BrandFooter, Card, LogoLockup } from "@/components/ui";
import { AgentTermsText } from "@/modules/agents/AgentTerms";

export default function AgentTermsPage() {
  return (
    <div className="auth-page relative flex min-h-screen justify-center px-4 py-8">
      <Card className="mb-12 w-full max-w-2xl space-y-4">
        <div className="mx-auto max-w-xs">
          <LogoLockup />
        </div>
        <h1 className="text-base font-semibold">
          Пользовательское соглашение удалённого менеджера
        </h1>
        <AgentTermsText />
      </Card>
      <div className="absolute bottom-3 left-0 right-0">
        <BrandFooter onDark />
      </div>
    </div>
  );
}
