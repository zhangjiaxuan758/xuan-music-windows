/**
 * 小轩音乐 · 统一服务端连接层
 * ------------------------------------------------------------------
 * 客户端 / 网页端共用同一份实现：
 *   - 启动拉取一次性票据 → 拉全量配置 → 建立 SSE 长连接
 *   - 管理端保存配置后，服务端广播 config 事件，此处热应用（不刷新、不重启）
 *   - 网易云 eapi 全部走服务端代理，客户端不保存任何密钥
 *   - 所有请求带 HMAC 签名 + 时间戳 + nonce，防重放
 *
 * 域名：https://music.jrr.lol  （网页端同源，客户端用 CapacitorHttp 绕过 WebView 跨域）
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';

export const XUAN_SERVER = 'https://music.jrr.lol';

// 应用级签名密钥：仅用于「证明请求来自本应用」，不是敏感信息。
// 真正的 eapi 密钥 / 管理口令只存在服务端。
const APP_SIGN_SECRET = 'xuan-app-sign-v1-9f3c2a71e5d8b4601';

export interface XuanTab { id: string; label: string; visible: boolean; order: number }
export interface XuanDevPick { id: number; name: string; artist: string }
export interface XuanConfig {
  version: number;
  serverTime?: number;
  app: { name: string; subtitle: string; showDevRecommend: boolean; showHotChart: boolean; showGufengChart: boolean; showCache: boolean };
  tabs: XuanTab[];
  developerPicks: XuanDevPick[];
  charts: Record<string, { playlistId: number; label: string }>;
  quality: { default: string; maxFree: string };
  effects: { enabled: boolean; bass: number; surround: number; limit: number };
  ui: {
    immersiveDoubleTap: boolean; buttonFadeDuration: number; lyricsFontSize: number;
    progressShowPrevNext: boolean; showStatusBarFavorite: boolean;
  };
  announcement: { enabled: boolean; title: string; content: string; id: number };
  texts: Record<string, string>;
  links: { github: string };
  update: { versionCode: number; versionName: string; apkFile: string; changelog: string; force: boolean };
  updateWindows?: { versionCode: number; versionName: string; exeFile: string; changelog: string; force: boolean };
}

const isNative = () => Capacitor.isNativePlatform();

let ticket = '';
let ticketExpire = 0;
let cfg: XuanConfig | null = null;
const listeners = new Set<(c: XuanConfig) => void>();
let started = false;
let sseAbort: AbortController | null = null;
let reconnectTimer: number | null = null;
let updateListener: ((u: UpdateInfo) => void) | null = null;

export interface UpdateInfo {
  versionCode: number; versionName: string; changelog: string;
  downloadUrl: string; force: boolean; hasApk: boolean;
}

// ---------------------------------------------------------------- 基础 HTTP
const enc = new TextEncoder();

async function hmacSha256Hex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function nonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function ensureTicket(): Promise<string> {
  if (ticket && Date.now() < ticketExpire - 5000) return ticket;
  const r = await rawGet('/api/ticket');
  if (r.ok && r.data?.ticket) {
    ticket = r.data.ticket;
    ticketExpire = Date.now() + (r.data.ttl || 60) * 1000;
    return ticket;
  }
  return '';
}

async function signHeaders(method: string, path: string, body: string, adminToken = '', bodyBytes?: Uint8Array): Promise<Record<string, string>> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const n = nonce();
  // 二进制上传（APK）时按真实字节计算摘要，与服务端校验严格一致
  const bodyHash = bodyBytes
    ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bodyBytes.buffer as ArrayBuffer))).map(b => b.toString(16).padStart(2, '0')).join('')
    : await sha256Hex(body);
  const t = await ensureTicket();
  // 票据参与签名密钥派生：签名不可被第三方复用
  const key = await sha256Hex(APP_SIGN_SECRET + '|' + t);
  const sign = await hmacSha256Hex(key, `${ts}|${n}|${path}|${bodyHash}`);
  return {
    'X-Xuan-Ts': ts,
    'X-Xuan-Nonce': n,
    'X-Xuan-Sign': sign,
    'X-Xuan-Ticket': t,
    ...(adminToken ? { 'X-Xuan-Admin-Token': adminToken } : {}),
  };
}

async function rawGet(path: string): Promise<{ ok: boolean; data: any; status: number }> {
  const url = XUAN_SERVER + path;
  try {
    if (isNative()) {
      const r = await CapacitorHttp.get({ url, responseType: 'json', connectTimeout: 12000, readTimeout: 12000 });
      return { ok: r.status >= 200 && r.status < 300, data: r.data, status: r.status };
    }
    const r = await fetch(url, { credentials: 'omit', cache: 'no-store' });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, data, status: r.status };
  } catch {
    return { ok: false, data: null, status: 0 };
  }
}

async function signedRequest<T = any>(method: 'GET' | 'POST', path: string, payload?: any, adminToken = ''): Promise<T | null> {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  const headers = await signHeaders(method, path, body, adminToken);
  const url = XUAN_SERVER + path;
  try {
    let status: number; let data: any;
    if (isNative()) {
      const r = await CapacitorHttp.request({
        method, url, headers: { ...headers, 'Content-Type': 'application/json' },
        data: body || undefined, responseType: 'json', connectTimeout: 20000, readTimeout: 20000,
      });
      status = r.status; data = r.data;
    } else {
      const r = await fetch(url, {
        method, headers: { ...headers, 'Content-Type': 'application/json' },
        body: body || undefined, credentials: 'omit', cache: 'no-store',
      });
      status = r.status; data = await r.json().catch(() => null);
    }
    return { ok: status >= 200 && status < 300, status, ...(data || {}) } as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- 配置与实时同步
export const getServerConfig = (): XuanConfig | null => cfg;

export function onServerConfigChange(fn: (c: XuanConfig) => void): () => void {
  listeners.add(fn);
  if (cfg) fn(cfg);
  return () => { listeners.delete(fn); };
}

function applyConfig(next: XuanConfig) {
  if (cfg && next.version === cfg.version) return;
  cfg = next;
  try { localStorage.setItem('xuan_server_config', JSON.stringify(next)); } catch { /* noop */ }
  // 暴露给无依赖模块（audioEffects 等）读取远程开关
  try { (window as unknown as { __xuanServerConfig?: XuanConfig }).__xuanServerConfig = next; } catch { /* noop */ }
  listeners.forEach(fn => { try { fn(next); } catch { /* noop */ } });
  try { window.dispatchEvent(new CustomEvent('xuan:server-config', { detail: next })); } catch { /* noop */ }
}

export async function fetchServerConfig(): Promise<XuanConfig | null> {
  const r = await signedRequest<{ ok: boolean; version: number } & XuanConfig>('GET', '/api/config');
  if (r && r.ok && (r as any).tabs) { applyConfig(r as unknown as XuanConfig); return cfg; }
  return cfg;
}

export function onServerUpdate(fn: (u: UpdateInfo) => void) { updateListener = fn; }

async function openSSE() {
  sseAbort?.abort();
  sseAbort = new AbortController();
  const t = await ensureTicket();
  const url = `${XUAN_SERVER}/api/stream?ticket=${encodeURIComponent(t)}`;
  try {
    if (isNative()) {
      // CapacitorHttp 不支持流式，native 端用低间隔增量轮询兜底（同样不重启、热应用）
      startNativePolling();
      return;
    }
    const resp = await fetch(url, { signal: sseAbort.signal, credentials: 'omit', cache: 'no-store' });
    if (!resp.ok || !resp.body) throw new Error('sse failed');
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const part of parts) {
        const ev = /^event:\s*(\S+)/m.exec(part)?.[1] || '';
        const dataLine = /^data:\s*(.+)$/m.exec(part)?.[1];
        if (!dataLine) continue;
        try {
          const payload = JSON.parse(dataLine);
          if (ev === 'config' && payload.config) applyConfig(payload.config);
          else if (ev === 'config' && payload.version) fetchServerConfig();
          // 服务端 update 事件只作通知，其载荷字段与 UpdateInfo 不一致；
          // 重新拉取权威的 checkUpdate，避免更新弹窗拿到 undefined 版本信息。
          else if (ev === 'update') void checkUpdate(true);
          else if (ev === 'hello' && payload.version && (!cfg || payload.version !== cfg.version)) fetchServerConfig();
        } catch { /* noop */ }
      }
    }
  } catch {
    // 断线重连
  } finally {
    if (!sseAbort?.signal.aborted) scheduleReconnect();
  }
}

let nativePollTimer: number | null = null;
function startNativePolling() {
  if (nativePollTimer) return;
  nativePollTimer = window.setInterval(async () => {
    await fetchServerConfig();
    await checkUpdate(false);
  }, 4000);
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    openSSE();
  }, 3000);
}

/** 应用启动时调用一次 */
export async function initXuanServer() {
  if (started) return;
  started = true;
  try {
    const cached = localStorage.getItem('xuan_server_config');
    if (cached) { try { cfg = JSON.parse(cached); (window as unknown as { __xuanServerConfig?: XuanConfig }).__xuanServerConfig = cfg ?? undefined; } catch { /* noop */ } }
  } catch { /* noop */ }
  await fetchServerConfig();
  openSSE();
  // 断网恢复后立刻重连
  window.addEventListener('online', () => { fetchServerConfig(); openSSE(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') fetchServerConfig();
  });
}

// ---------------------------------------------------------------- 网易云 eapi 代理
/**
 * 客户端不保存 eapiKey / eapiSalt，明文参数交给服务端加密转发。
 * 返回 { body, setCookie }，与旧版 officialRequest 完全兼容。
 */
export async function eapiRequest(apiPath: string, data: Record<string, unknown>, cookie: string): Promise<{ body: any; setCookie: string }> {
  const payload = JSON.stringify({ path: apiPath, data, cookie });
  const r = await signedRequest<{ ok: boolean; body: any; setCookie: string; code: number; message: string }>(
    'POST', '/api/eapi', { path: apiPath, data, cookie });
  if (!r) return { body: { code: -1, message: '无法连接服务端' }, setCookie: '' };
  if (r.ok) return { body: (r as any).body ?? r, setCookie: (r as any).setCookie || '' };
  return { body: { code: -1, message: (r as any).message || '服务端请求失败' }, setCookie: '' };
}

// ---------------------------------------------------------------- 更新检查
export async function checkUpdate(notify = true, platform: 'android' | 'windows' = 'android'): Promise<UpdateInfo | null> {
  const path = platform === 'windows' ? '/api/update/check-win' : '/api/update/check';
  const r = await signedRequest<UpdateInfo & { ok: boolean }>('GET', path);
  if (!r || !r.ok) return null;
  const info: UpdateInfo = {
    versionCode: r.versionCode, versionName: r.versionName,
    changelog: r.changelog, downloadUrl: r.downloadUrl,
    force: r.force, hasApk: r.hasApk,
  };
  if (notify && updateListener) updateListener(info);
  return info;
}

export async function downloadUrl(path: string): Promise<string> {
  const t = await ensureTicket();
  return `${XUAN_SERVER}${path}${path.includes('?') ? '&' : '?'}ticket=${encodeURIComponent(t)}`;
}

// ---------------------------------------------------------------- 管理端 API（管理端 App 复用本文件）
export async function adminLogin(password: string): Promise<string | null> {
  const r = await signedRequest<{ token: string }>('POST', '/api/admin/login', { password });
  return r?.token || null;
}
export async function adminGetConfig(token: string): Promise<XuanConfig | null> {
  const r = await signedRequest<XuanConfig & { ok: boolean }>('GET', '/api/admin/config', undefined, token);
  return r && (r as any).tabs ? r : null;
}
export async function adminSaveConfig(token: string, config: XuanConfig): Promise<boolean> {
  const r = await signedRequest<{ ok: boolean }>('POST', '/api/admin/config', config, token);
  return !!r?.ok;
}
export async function adminUploadApk(token: string, file: Blob, name: string, versionCode: number, versionName: string, changelog: string): Promise<boolean> {
  const ab = await file.arrayBuffer();
  const body = new Uint8Array(ab);
  const headers = await signHeaders('POST', '/api/admin/apk', '', token, body);
  const url = XUAN_SERVER + '/api/admin/apk';
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/octet-stream',
        'X-Xuan-Apk-Name': name,
        'X-Xuan-Version-Code': String(versionCode),
        'X-Xuan-Version-Name': versionName,
        'X-Xuan-Changelog': encodeURIComponent(changelog),
      },
      body,
    });
    return r.ok;
  } catch { return false; }
}

export async function adminChangePassword(token: string, password: string): Promise<boolean> {
  const r = await signedRequest<{ ok: boolean }>('POST', '/api/admin/password', { password }, token);
  return !!r?.ok;
}
