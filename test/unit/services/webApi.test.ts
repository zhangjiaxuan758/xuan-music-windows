import { describe, expect, it } from 'vitest';
import { resolveXuanApiUrl } from '@/services/webApi';

// 当前文件：验证 Xuan API 地址在 Web 与 Capacitor Android 中的解析契约。

describe('resolveXuanApiUrl', () => {
  it('normalizes the configured remote base and endpoint', () => {
    expect(resolveXuanApiUrl('/api/lyric-proxy', {
      apiBase: ' https://xuan.izuna.top/api/ ',
      capacitorAndroid: true,
    })).toBe('https://xuan.izuna.top/api/lyric-proxy');
  });

  it('keeps the same-origin Web fallback when no base is configured', () => {
    expect(resolveXuanApiUrl('generate-theme', {
      apiBase: '',
      capacitorAndroid: false,
    })).toBe('/api/generate-theme');
  });

  it('requires a remote base for Capacitor Android', () => {
    expect(() => resolveXuanApiUrl('/api/generate-theme', {
      apiBase: '',
      capacitorAndroid: true,
    })).toThrow(/VITE_XUAN_API_BASE/);
  });
});
