"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { LoadingState } from "@/components/ui";
import { isCollectionStaff, legalHomePath } from "@/lib/organization-features";
import { useAuth } from "@/modules/auth/AuthProvider";

function isCivilCasesPath(pathname: string): boolean {
  return pathname.startsWith("/civil-cases");
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

    if (user.role === "executor" && !isCivilCasesPath(pathname)) {
      router.replace("/civil-cases");
      return;
    }
    if (isCollectionStaff(user) && pathname === "/") {
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

  return <AppShell>{children}</AppShell>;
}
