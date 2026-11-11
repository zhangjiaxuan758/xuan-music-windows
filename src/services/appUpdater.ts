/**
 * 客户端在线更新
 * ------------------------------------------------------------------
 * 管理端上传新 APK → 服务端 update 段更新 → 客户端下次启动检查 →
 * 弹窗「已有新版本 是否更新软件」→ 确定/取消 → 下载 → 点击安装。
 *
 * 覆盖安装：新 APK 与旧版同包名 com.music.xuan、同一签名密钥，
 * Android 系统会直接升级覆盖，不会出现两个软件。
 * 更新地址与所有接口均走 https://music.jrr.lol。
 *
 * 下载通道：优先 WebView fetch 流式下载（有进度、内存友好）；失败时回退到
 * CapacitorHttp（原生 HTTP，与取票据同一 UA，不受 WebView CORS / UA 差异影响）。
 */

import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { checkUpdate, downloadUrl, initXuanServer, type UpdateInfo } from './xuanServer';

const XuanNative = registerPlugin<{
  installApk(options: { path: string }): Promise<{ ok: boolean }>;
  getApkVersion(): Promise<{ versionCode: number; versionName: string }>;
  updateMedia(options: MediaOptions): Promise<void>;
  hideMedia(): Promise<void>;
} & Record<string, any>>('XuanNative');

export interface MediaOptions {
  title: string; artist: string; playing: boolean; cover?: string | null;
  showFavorite: boolean; liked: boolean;
}

// 当前客户端 versionCode；构建脚本会注入真实值，仅作原生读取失败时的兜底
declare const __XUAN_VERSION_CODE__: number | undefined;
export const CURRENT_VERSION_CODE: number =
  (typeof __XUAN_VERSION_CODE__ !== 'undefined' ? __XUAN_VERSION_CODE__ : 10629);

/**
 * 运行时版本码：优先从原生 PackageManager 读取 APK 真实 versionCode。
 * 构建注入值可能过期（旧构建弹「有新版」、系统装不上同版本），原生读取才能根治。
 */
export async function resolveCurrentVersionCode(): Promise<number> {
  if (Capacitor.isNativePlatform()) {
    try {
      const v = await XuanNative.getApkVersion();
      if (v && Number.isFinite(v.versionCode) && v.versionCode > 0) return v.versionCode;
    } catch { /* 旧包无此方法时走兜底 */ }
  }
  return CURRENT_VERSION_CODE;
}

// 管理端「更新说明」留空时的兜底文案（服务端也会下发同一默认值）
export const DEFAULT_CHANGELOG = '修复已知问题，请尽快更新';

const CHECKED_KEY = 'xuan_update_checked_session';

function el(tag: string, style: Partial<CSSStyleDeclaration>, text?: string): HTMLElement {
  const n = document.createElement(tag);
  Object.assign(n.style, style);
  if (text) n.textContent = text;
  return n;
}

let dialogOpen = false;

function showUpdateDialog(info: UpdateInfo, onConfirm: () => void) {
  if (dialogOpen) return;
  dialogOpen = true;
  const overlay = el('div', {
    position: 'fixed', inset: '0', zIndex: '99999', display: 'flex',
    alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.62)',
    backdropFilter: 'blur(6px)', fontFamily: 'system-ui, -apple-system, sans-serif',
  });
  const card = el('div', {
    width: 'min(420px, 86vw)', background: '#232326', color: '#f2f2f3',
    borderRadius: '18px', padding: '28px', boxShadow: '0 24px 70px rgba(0,0,0,.55)',
    border: '1px solid rgba(255,255,255,.08)',
  });
  const title = el('div', { fontSize: '19px', fontWeight: '700', marginBottom: '8px' }, '已有新版本');
  const ver = el('div', { fontSize: '13px', color: '#a1a1a6', marginBottom: '14px' },
    `新版本 ${info.versionName || ''}（${info.versionCode}）`);
  const desc = el('div', {
    fontSize: '13px', color: '#d0d0d4', lineHeight: '1.7', marginBottom: '24px',
    maxHeight: '150px', overflowY: 'auto', whiteSpace: 'pre-wrap',
  }, (info.changelog || '').trim() || DEFAULT_CHANGELOG);

  const row = el('div', { display: 'flex', gap: '12px', justifyContent: 'flex-end' });
  const btn = (label: string, primary: boolean, cb: () => void) => {
    const b = el('button', {
      padding: '10px 22px', borderRadius: '10px', border: 'none', cursor: 'pointer',
      fontSize: '14px', fontWeight: '600', transition: 'opacity .15s',
      background: primary ? '#f2f2f3' : 'rgba(255,255,255,.10)',
      color: primary ? '#1c1c1e' : '#e8e8ea',
    }, label) as HTMLButtonElement;
    b.onmouseenter = () => { b.style.opacity = '.82'; };
    b.onmouseleave = () => { b.style.opacity = '1'; };
    b.onclick = cb;
    return b;
  };

  const close = () => { overlay.remove(); dialogOpen = false; };
  const cancel = btn('取消', false, () => {
    try { sessionStorage.setItem(CHECKED_KEY, '1'); } catch { /* noop */ }
    close();
  });
  const confirm = btn('确定', true, () => { close(); onConfirm(); });
  row.append(cancel, confirm);
  card.append(title, ver, desc, row);
  overlay.append(card);
  overlay.addEventListener('click', e => { if (e.target === overlay) cancel.click(); });
  document.body.append(overlay);
}

interface ProgressUI {
  set: (pct: number, text: string) => void;
  done: (ok: boolean, install: () => void, errMsg?: string) => void;
}

function showProgressDialog(): ProgressUI {
  const overlay = el('div', {
    position: 'fixed', inset: '0', zIndex: '99999', display: 'flex',
    alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.62)',
    backdropFilter: 'blur(6px)', fontFamily: 'system-ui, -apple-system, sans-serif',
  });
  const card = el('div', {
    width: 'min(420px, 86vw)', background: '#232326', color: '#f2f2f3',
    borderRadius: '18px', padding: '28px', border: '1px solid rgba(255,255,255,.08)',
  });
  const title = el('div', { fontSize: '17px', fontWeight: '700', marginBottom: '16px' }, '正在下载更新');
  const label = el('div', { fontSize: '12px', color: '#a1a1a6', marginBottom: '10px' }, '准备中…');
  const track = el('div', { height: '6px', borderRadius: '4px', background: 'rgba(255,255,255,.10)', overflow: 'hidden' });
  const fill = el('div', { height: '100%', width: '0%', background: '#f2f2f3', transition: 'width .2s' });
  track.append(fill);
  card.append(title, label, track);
  overlay.append(card);
  document.body.append(overlay);

  return {
    set: (pct, text) => { fill.style.width = `${Math.min(100, Math.max(0, pct))}%`; label.textContent = text; },
    done: (ok, install, errMsg) => {
      title.textContent = ok ? '下载完成' : '下载失败';
      label.textContent = ok
        ? '点击下方按钮安装，安装后即为新版本'
        : (errMsg ? `原因：${errMsg}（请检查网络后重试）` : '请检查网络后重试');
      const b = el('button', {
        marginTop: '20px', width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
        background: ok ? '#f2f2f3' : 'rgba(255,255,255,.10)',
        color: ok ? '#1c1c1e' : '#e8e8ea', fontWeight: '600', fontSize: '14px', cursor: 'pointer',
      }, ok ? '安装' : '关闭') as HTMLButtonElement;
      b.onclick = () => { if (ok) { overlay.remove(); install(); } else overlay.remove(); };
      card.append(b);
    },
  };
}

/** WebView fetch 流式下载（有进度、内存友好） */
async function fetchApkBytes(url: string, ui: ProgressUI): Promise<Uint8Array> {
  const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length') || 0);
  const reader = res.body?.getReader();
  if (!reader) throw new Error('不支持流式下载');
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const pct = total ? (received / total) * 100 : Math.min(95, received / 300000);
    ui.set(pct, `已下载 ${(received / 1048576).toFixed(1)} MB${total ? ` / ${(total / 1048576).toFixed(1)} MB` : ''}`);
  }
  const all = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.length; }
  return all;
}

/** 兜底：CapacitorHttp 原生下载，与取票据同一 UA，不受 WebView CORS / UA 差异影响 */
async function nativeFallbackBytes(url: string, ui: ProgressUI): Promise<Uint8Array> {
  ui.set(30, '切换原生通道下载…');
  const r = await CapacitorHttp.request({
    method: 'GET', url, responseType: 'blob',
    connectTimeout: 30000, readTimeout: 180000,
  });
  if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}（原生通道）`);
  const b64 = typeof r.data === 'string' ? r.data : '';
  if (!b64) throw new Error('原生通道返回为空');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function downloadApk(info: UpdateInfo) {
  const ui = showProgressDialog();
  try {
    const url = await downloadUrl(info.downloadUrl || '/download/xuan-music.apk');
    let bytes: Uint8Array;
    try {
      bytes = await fetchApkBytes(url, ui);
    } catch (e1) {
      if (!Capacitor.isNativePlatform()) throw e1;
      bytes = await nativeFallbackBytes(url, ui);
    }
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/vnd.android.package-archive' });
    const path = await writeApkToPrivate(blob);
    ui.set(100, '下载完成');
    ui.done(true, () => { void installApk(path); });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || '未知错误');
    ui.done(false, () => {}, msg);
  }
}

async function writeApkToPrivate(blob: Blob): Promise<string> {
  // 通过原生插件写入应用私有目录（FileProvider 可共享给系统安装器）
  const base64 = await new Promise<string>(resolve => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.readAsDataURL(blob);
  });
  if (!base64) throw new Error('安装包数据为空');
  const r = await (XuanNative as any).saveApk?.({ base64, name: 'xuan-update.apk' });
  if (!r?.path) throw new Error('写入安装包失败');
  return r.path as string;
}

async function installApk(path: string) {
  try { await XuanNative.installApk({ path }); } catch { /* 用户可稍后手动安装 */ }
}

/** Windows 桌面版由 Electron preload 注入 __xuanDesktop=true；网页端没有该标记。 */
const isDesktop = (): boolean =>
  typeof window !== 'undefined' &&
  (window as unknown as { __xuanDesktop?: boolean }).__xuanDesktop === true;

/** 启动时调用：安卓 App 检查 APK 通道；Windows 桌面版检查 exe 通道；纯网页端不检查。 */
export async function initAppUpdater() {
  const desktop = isDesktop();
  if (!Capacitor.isNativePlatform() && !desktop) return;
  try {
    if (sessionStorage.getItem(CHECKED_KEY)) return;   // 本次启动已询问过
  } catch { /* noop */ }
  await initXuanServer();
  // 桌面版读服务端 updateWindows 段（与安卓 APK 通道完全独立）
  const info = await checkUpdate(false, desktop ? 'windows' : 'android');
  const current = await resolveCurrentVersionCode();
  if (!info || !info.hasApk || info.versionCode <= current) return;
  if (desktop) {
    // exe 无法像 APK 那样静默安装：确认后交给系统默认浏览器下载安装包，
    // 用户运行 Setup 覆盖安装即可（同 appId、数据保留）。
    showUpdateDialog(info, () => {
      void downloadUrl(info.downloadUrl || '/download/xuan-music-desktop.exe')
        .then(url => { window.open(url, '_blank'); })
        .catch(() => { /* noop */ });
    });
    return;
  }
  showUpdateDialog(info, () => { void downloadApk(info); });
}

// ---------------------------------------------------------------- 状态栏媒体通知
export async function updateMediaNotification(o: MediaOptions) {
  if (!Capacitor.isNativePlatform()) return;
  try { await XuanNative.updateMedia(o as any); } catch { /* noop */ }
}
export async function hideMediaNotification() {
  if (!Capacitor.isNativePlatform()) return;
  try { await XuanNative.hideMedia(); } catch { /* noop */ }
}

/** 监听状态栏通知按钮（播放/暂停、上一首、下一首、收藏） */
export function onMediaAction(handler: (action: 'play' | 'pause' | 'prev' | 'next' | 'like') => void) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const h = (XuanNative as any).addListener('mediaAction', (e: any) => handler(e?.action));
  return () => { void h.then((x: any) => x?.remove?.()); };
}
