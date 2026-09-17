"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { ApiRequestError, tasksApi } from "@/lib/api-client";
import { canManageClients } from "@/lib/organization-features";
import { useAuth } from "@/modules/auth/AuthProvider";

export function useOpenTasksCount() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const canUse = canManageClients(user);

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
    void refresh();
  }, [refresh, pathname]);

  return count;
}
