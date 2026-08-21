"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { RetailShell } from "@/components/RetailShell";
import { LoadingState } from "@/components/ui";
import { isCollectionStaff, legalHomePath } from "@/lib/organization-features";
import { useAuth } from "@/modules/auth/AuthProvider";

function isRetailPath(pathname: string): boolean {
  return pathname.startsWith("/retail");
}

export function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
      return;
    }
    if (!user) return;

    const retailUser = user.organization_type === "retail";
    if (retailUser && !isRetailPath(pathname)) {
      router.replace("/retail");
      return;
    }
    if (!retailUser && isRetailPath(pathname)) {
      router.replace("/");
      return;
    }
    if (!retailUser && isCollectionStaff(user) && (pathname === "/" || pathname.startsWith("/clients/contracts"))) {
      router.replace(legalHomePath(user));
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center mesh-bg px-4">
        <LoadingState text="Загрузка приложения..." />
      </div>
    );
  }

  if (!user) return null;

  if (isRetailPath(pathname)) {
    return <RetailShell>{children}</RetailShell>;
  }

  return <AppShell>{children}</AppShell>;
}
