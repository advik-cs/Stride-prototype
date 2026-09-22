/**
 * Global API configuration and error handling.
 */
const env = (import.meta as any).env || (typeof process !== 'undefined' ? process.env : {}) || {};

// Universal production API base URL (configurable in Vercel as VITE_API_BASE_URL or VITE_API_URL)
const universalBase = env.VITE_API_BASE_URL || env.VITE_API_URL || '';
const cleanUniversal = universalBase ? universalBase.replace(/\/+$/, '') : '';
const universalApi = cleanUniversal
  ? (cleanUniversal.endsWith('/api') ? cleanUniversal : `${cleanUniversal}/api`)
  : '';

// Detect local development environment
const isLocal =
  typeof window !== 'undefined'
    ? window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('192.168.') ||
      window.location.hostname.startsWith('10.')
    : true;

export const BEFORE_API_BASE_URL =
  env.VITE_BEFORE_API_URL ||
  universalApi ||
  (isLocal && typeof window !== 'undefined' && window.location.port !== '3000'
    ? 'http://localhost:4000/api'
    : '/api');

export function getDuringApiBaseUrl(): string {
  if (typeof window !== 'undefined' && (window as any).__STRIDE_DURING_API_URL__) {
    return (window as any).__STRIDE_DURING_API_URL__;
  }
  const currentEnv = (import.meta as any).env || (typeof process !== 'undefined' ? process.env : {}) || {};
  return (
    currentEnv.VITE_DURING_API_URL ||
    universalApi ||
    (isLocal && typeof window !== 'undefined' && window.location.port !== '3000'
      ? 'http://localhost:5000/api'
      : '/api')
  );
}

export const DURING_API_BASE_URL = getDuringApiBaseUrl();

export const FLOODX_EMBED_URL =
  env.VITE_FLOODX_EMBED_URL ||
  (isLocal ? 'http://localhost:3001' : 'https://flood-x-delta.vercel.app');

export class ApiError extends Error {
  statusCode: number;
  details?: any;

  constructor(message: string, statusCode: number, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function extractErrorMessage(err: any): string {
  if (err instanceof ApiError) return err.message;
  if (err?.response?.data?.error?.message) return err.response.data.error.message;
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.message) return err.message;
  return 'An unexpected network error occurred.';
}
