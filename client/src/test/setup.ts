import '@testing-library/jest-dom/vitest';

// Node 22+ ships its own global `localStorage` (behind the
// --experimental-webstorage flag, on by default in newer Node releases). It
// installs a lazy accessor directly on the real process globalThis that
// throws/returns undefined without --localstorage-file. Vitest's jsdom
// environment treats `globalThis === window` and skips re-installing keys
// that already exist on the real global, so jsdom's own Storage
// implementation never gets a chance to take over `localStorage` here —
// Node's non-functional stub wins. Replace it with a small in-memory
// Storage implementation so app code that reads the bare `localStorage`
// identifier (as it will in the real browser) works under test too.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
});

// react-router-dom v6 prints "Future Flag Warning" console.warn notices for
// v7 opt-in flags whenever a Router is mounted without them. This is a
// benign, permanent third-party notice (not a bug in our code) that would
// otherwise make every test using MemoryRouter/BrowserRouter non-pristine.
// Filter only this exact known message; all other console.warn calls
// (e.g. genuine React warnings) still surface normally.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('React Router Future Flag Warning')) return;
  originalWarn(...args);
};
