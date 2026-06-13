import { useEffect, useState } from 'react';

export interface ResourceState<T> {
  loading: boolean;
  error: Error | null;
  data: T | null;
}

export function useResource<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
): ResourceState<T> {
  const [state, setState] = useState<ResourceState<T>>({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, data: null });
    fetcher().then(
      (data) => alive && setState({ loading: false, error: null, data }),
      (error: Error) => alive && setState({ loading: false, error, data: null }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
