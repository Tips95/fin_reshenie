"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { ApiRequestError, tasksApi } from "@/lib/api-client";
import { canManageClients } from "@/lib/organization-features";
import { useAuth } from "@/modules/auth/AuthProvider";

const REFRESH_DEBOUNCE_MS = 400;

export function useOpenTasksCount() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const canUse = canManageClients(user);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!canUse) {
      setCount(0);
      return;
    }
    try {
      const data = await tasksApi.count();
      setCount(data.count);
    } catch (error) {
      if (!(error instanceof ApiRequestError)) {
        setCount(0);
      }
    }
  }, [canUse]);

  useEffect(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [refresh, pathname]);

  return count;
}
