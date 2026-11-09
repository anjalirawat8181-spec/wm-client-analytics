import { useEffect, useState } from "react";

const cache = new Map<string, Promise<unknown>>();

export function loadJson<T>(name: string): Promise<T> {
  let p = cache.get(name);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${name}.json (${r.status})`);
      return r.json();
    });
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p as Promise<T>;
}

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useJson<T>(name: string): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    loadJson<T>(name)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [name]);
  return state;
}
