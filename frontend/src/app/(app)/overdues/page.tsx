"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { LoadingState } from "@/components/ui";
import { canWorkOverdues, legalHomePath } from "@/lib/organization-features";
import { useAuth } from "@/modules/auth/AuthProvider";
import { OverduesQueue } from "@/modules/overdues/OverduesQueue";

export default function OverduesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const allowed = canWorkOverdues(user);

  useEffect(() => {
    if (!allowed) router.replace(legalHomePath(user));
  }, [allowed, router, user]);

  if (!allowed) return <LoadingState text="Перенаправление..." />;
  return <OverduesQueue />;
}
