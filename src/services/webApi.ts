import { isCapacitorAndroid } from '../platform/runtime';

// 当前文件：解析 Web 与 Capacitor 共用的 Folia 服务端 API 地址。

export interface FoliaApiResolutionOptions {
  apiBase?: string | null;
  capacitorAndroid?: boolean;
}

const readConfiguredApiBase = (): string => {
  // 优先使用「音源服务器设置」里运行时填写的地址。
  try {
    const runtime = typeof window !== 'undefined'
      ? String(window.localStorage.getItem('xuan.server.folia') || '').trim()
      : '';
    if (runtime) return runtime;
  } catch { /* localStorage 不可用时回退到构建时配置 */ }
  return String(import.meta.env.VITE_FOLIA_API_BASE || '').trim();
};

const normalizeApiBase = (value: string): string => value.replace(/\/+$/, '');
const normalizeEndpoint = (value: string): string => value.replace(/^\/+/, '').replace(/^api\/+/, '');

// Builds one API URL while preserving the existing same-origin Web fallback.
export const resolveFoliaApiUrl = (
  endpoint: string,
  options: FoliaApiResolutionOptions = {},
): string => {
  const configuredBase = options.apiBase === undefined
    ? readConfiguredApiBase()
    : String(options.apiBase || '').trim();
  const capacitorAndroid = options.capacitorAndroid ?? isCapacitorAndroid();
  const normalizedEndpoint = normalizeEndpoint(endpoint);

  if (configuredBase) {
    return `${normalizeApiBase(configuredBase)}/${normalizedEndpoint}`;
  }

  if (capacitorAndroid) {
    throw new Error('VITE_FOLIA_API_BASE must be configured for the Capacitor Android build.');
  }

  return `/api/${normalizedEndpoint}`;
};
