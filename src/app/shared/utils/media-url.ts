import { environment } from '../../../environments/environment';

/** Origin of the API, e.g. `http://localhost:8080` (apiUrl minus the `/api/v1` suffix). */
const API_ORIGIN = environment.apiUrl.replace(/\/api\/v1\/?$/, '');

/** Public path prefix served by the backend `FileController`. */
const FILES_PREFIX = '/api/v1/files/';

/**
 * Resolves a media reference returned by the API into a browser-usable URL.
 *
 * The backend is not fully consistent about the shape it returns: some endpoints
 * hand back a bare MinIO object key (`photos/abc.jpg`), others a root-relative
 * path (`/api/v1/files/photos/abc.jpg`). Both forms — plus absolute URLs and
 * `data:`/`blob:` references — resolve to the same final URL here, so callers
 * never need to know which endpoint the value came from.
 *
 * Usage:
 *   <img [src]="mediaUrl(freelancer.photoUrl)">
 */
export function mediaUrl(value: string | null | undefined): string {
  if (!value) return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  // Already fully qualified (or an in-memory reference) — nothing to resolve.
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;

  const path = trimmed.startsWith('/api/')
    ? trimmed
    : FILES_PREFIX + trimmed.replace(/^\/+/, '');

  return API_ORIGIN + path;
}

/**
 * Strips the public `/api/v1/files/` prefix (and any origin) from a media
 * reference, yielding the bare storage object key the API persists.
 *
 * Used when echoing a value the API handed us back into a write request, so the
 * prefix is never stored twice.
 */
export function mediaObjectKey(value: string | null | undefined): string | undefined {
  if (!value) return undefined;

  let path = value.trim();
  if (!path) return undefined;

  if (/^https?:/i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return path;
    }
  }

  const index = path.indexOf(FILES_PREFIX);
  if (index >= 0) path = path.substring(index + FILES_PREFIX.length);

  return path.replace(/^\/+/, '') || undefined;
}
