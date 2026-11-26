/** A fresh, isolated browser profile for authentication journey tests. */
export function memoryStorage(): Storage {
  const data = new Map<string,string>();
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.get(key) ?? null; },
    setItem(key,value) { data.set(key,value); },
    removeItem(key) { data.delete(key); },
    clear() { data.clear(); },
  };
}
