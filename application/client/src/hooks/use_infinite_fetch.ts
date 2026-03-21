import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_LIMIT = 20;

/** apiPath に既にクエリがある場合は & で limit/offset を付与する */
function buildUrl(apiPath: string, offset: number, limit: number): string {
  const sep = apiPath.includes("?") ? "&" : "?";
  return `${apiPath}${sep}limit=${limit}&offset=${offset}`;
}

interface Options {
  limit?: number;
}

interface ReturnValues<T> {
  data: Array<T>;
  error: Error | null;
  isLoading: boolean;
  fetchMore: () => void;
}

export function useInfiniteFetch<T>(
  apiPath: string,
  fetcher: (apiPath: string) => Promise<T[]>,
  options?: Options,
): ReturnValues<T> {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const internalRef = useRef({ isLoading: false, offset: 0, hasMore: true });

  const [result, setResult] = useState<Omit<ReturnValues<T>, "fetchMore">>({
    data: [],
    error: null,
    isLoading: true,
  });

  const fetchMore = useCallback(() => {
    const { isLoading, offset, hasMore } = internalRef.current;
    if (isLoading || !hasMore || !apiPath) {
      return;
    }

    setResult((cur) => ({
      ...cur,
      isLoading: true,
    }));
    internalRef.current = {
      isLoading: true,
      offset,
      hasMore,
    };

    void fetcher(buildUrl(apiPath, offset, limit)).then(
      (page) => {
        setResult((cur) => ({
          ...cur,
          data: [...cur.data, ...page],
          isLoading: false,
        }));
        internalRef.current = {
          isLoading: false,
          offset: offset + limit,
          hasMore: page.length === limit,
        };
      },
      (error) => {
        setResult((cur) => ({
          ...cur,
          error,
          isLoading: false,
        }));
        internalRef.current = {
          isLoading: false,
          offset,
          hasMore,
        };
      },
    );
  }, [apiPath, fetcher, limit]);

  useEffect(() => {
    if (!apiPath) {
      setResult({ data: [], error: null, isLoading: false });
      internalRef.current = { isLoading: false, offset: 0, hasMore: false };
      return;
    }
    setResult(() => ({
      data: [],
      error: null,
      isLoading: true,
    }));
    internalRef.current = {
      isLoading: false,
      offset: 0,
      hasMore: true,
    };

    fetchMore();
  }, [fetchMore]);

  return {
    ...result,
    fetchMore,
  };
}
