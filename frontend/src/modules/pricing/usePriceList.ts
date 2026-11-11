"use client";

import { useEffect, useState } from "react";

import { agentsApi } from "@/lib/api-client";
import type { PriceList } from "@/lib/types";

let cached: Promise<PriceList> | null = null;

/** Прайс меняется редко — грузим один раз на вкладку, при ошибке пробуем снова. */
export function usePriceList(): { data: PriceList | null; error: boolean } {
  const [data, setData] = useState<PriceList | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    cached ??= agentsApi.priceList();
    cached.then(
      (list) => alive && setData(list),
      () => {
        cached = null;
        if (alive) setError(true);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  return { data, error };
}
