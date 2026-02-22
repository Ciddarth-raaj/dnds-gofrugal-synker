const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export const BACKEND_NOT_AVAILABLE =
  "Backend not available or proxy failed. Run `npm run dev` from the project root, or set VITE_API_URL=http://localhost:3080 in frontend/.env to point to the backend.";

function resolveUrl(path) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

/**
 * Fetch API URL and parse as JSON. If the response is HTML (e.g. proxy target down), throw a clear error.
 * Returns { res, data } so callers can check res.ok and use data.
 * Use VITE_API_URL in frontend/.env (e.g. http://localhost:3080) to hit the backend directly if the proxy fails.
 */
export async function apiFetch(path, options = {}) {
  const url = resolveUrl(path);
  const res = await fetch(url, options);
  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const data = JSON.parse(text);
      return { res, data };
    } catch (_) {
      throw new Error(BACKEND_NOT_AVAILABLE);
    }
  }
  if (text.trimStart().startsWith("<!") || text.trimStart().startsWith("<")) {
    throw new Error(BACKEND_NOT_AVAILABLE);
  }
  throw new Error(res.statusText || "Request failed");
}
