/**
 * Resolves a file in public/ against the app's base path.
 *
 * Never hard-code "/math.wasm". On GitHub Pages the demo lives under
 * /react-use-wasm/, so a leading slash points at the domain root and 404s.
 * Vite sets BASE_URL from `base` in vite.config.ts and always gives it a
 * trailing slash.
 */
export function asset(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}
