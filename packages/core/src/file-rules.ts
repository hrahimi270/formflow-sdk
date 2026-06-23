/**
 * File validation, ported from the plugin's `validation-rules.ts` and adapted to
 * also accept browser `File` objects. `maxSize` is expressed in MEGABYTES,
 * matching the admin rule editor and the server.
 */

import type { UploadedFileMeta, ValidationRule } from './types';

/** Anything we can treat as an uploaded file: a browser File or server meta. */
export type FileLike = File | UploadedFileMeta;

interface NormalizedFileInfo {
  fileName: string;
  mimeType: string;
  size: number;
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Extract name / MIME / size from either a browser `File` (name, type, size) or
 * the server's formidable meta (originalFilename/name, mimetype/type, size).
 */
export function getFileInfo(file: FileLike): NormalizedFileInfo {
  const anyFile = file as Record<string, unknown>;
  const fileName =
    (anyFile.originalFilename as string) || (anyFile.name as string) || 'file';
  const mimeType = String(
    (anyFile.mimetype as string) || (anyFile.type as string) || ''
  ).toLowerCase();
  const size = typeof anyFile.size === 'number' ? (anyFile.size as number) : 0;
  return { fileName, mimeType, size };
}

/** Returns true when a value is a browser `File` (best-effort, SSR-safe). */
export function isFile(value: unknown): value is File {
  if (typeof File !== 'undefined' && value instanceof File) return true;
  // Duck-type for non-DOM environments / Blob-likes.
  return (
    typeof value === 'object' &&
    value !== null &&
    hasOwn(value, 'name') &&
    hasOwn(value, 'size') &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  );
}

/**
 * Test whether a file's MIME type (with extension fallback) is permitted by a
 * comma-separated allow list. Supports `image/*` wildcards, `.pdf` and bare
 * `pdf` extensions, and exact MIME types. Mirrors the server's
 * `isFileTypeAllowed`.
 */
export function isFileTypeAllowed(
  mimeType: string,
  fileName: string,
  allowedTypesRaw: string
): boolean {
  const allowedTypes = allowedTypesRaw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  if (allowedTypes.length === 0) {
    return true;
  }

  const lowerName = fileName.toLowerCase();

  return allowedTypes.some((allowed) => {
    if (allowed.endsWith('/*')) {
      const category = allowed.slice(0, -1); // keep trailing slash -> "image/"
      return mimeType.startsWith(category);
    }
    if (allowed.startsWith('.')) {
      return lowerName.endsWith(allowed);
    }
    if (!allowed.includes('/')) {
      return lowerName.endsWith(`.${allowed}`);
    }
    return mimeType === allowed;
  });
}

/**
 * Validate a single file against a field's `maxSize` (MB) / `allowedTypes`
 * rules. Returns human-readable error messages (empty when valid). Mirrors the
 * server's `validateUploadedFile`.
 */
export function validateFile(file: FileLike, rules: ValidationRule[] = []): string[] {
  const errors: string[] = [];
  const { fileName, mimeType, size } = getFileInfo(file);

  for (const rule of rules) {
    if (rule.type === 'maxSize') {
      const maxSizeMb = Number(rule.value);
      if (!Number.isNaN(maxSizeMb) && maxSizeMb > 0) {
        const maxSizeBytes = maxSizeMb * 1024 * 1024;
        if (size > maxSizeBytes) {
          errors.push(
            rule.message || `File "${fileName}" exceeds the maximum size of ${maxSizeMb}MB`
          );
        }
      }
    } else if (rule.type === 'allowedTypes') {
      if (typeof rule.value === 'string' && rule.value.trim().length > 0) {
        if (!isFileTypeAllowed(mimeType, fileName, rule.value)) {
          errors.push(
            rule.message ||
              `File "${fileName}" type is not allowed. Accepted types: ${rule.value}`
          );
        }
      }
    }
  }

  return errors;
}
