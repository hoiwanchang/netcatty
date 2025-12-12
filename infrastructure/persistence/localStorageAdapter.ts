const safeParse = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const localStorageAdapter = {
  read<T>(key: string): T | null {
    return safeParse<T>(localStorage.getItem(key));
  },
  write<T>(key: string, value: T) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  readString(key: string): string | null {
    return localStorage.getItem(key);
  },
  writeString(key: string, value: string) {
    localStorage.setItem(key, value);
  },
  readBoolean(key: string): boolean | null {
    const value = localStorage.getItem(key);
    if (value === null) return null;
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
  },
  writeBoolean(key: string, value: boolean) {
    localStorage.setItem(key, value ? "true" : "false");
  },
  readNumber(key: string): number | null {
    const value = localStorage.getItem(key);
    if (!value) return null;
    const num = parseInt(value, 10);
    return isNaN(num) ? null : num;
  },
  writeNumber(key: string, value: number) {
    localStorage.setItem(key, String(value));
  },
  remove(key: string) {
    localStorage.removeItem(key);
  },
};
