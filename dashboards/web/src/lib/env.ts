export const REPO_URL: string =
  (import.meta.env.VITE_REPO_URL as string | undefined) ?? "https://github.com/anjalirawat8181-spec/wm-client-analytics";

export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}
