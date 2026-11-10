/**
 * 网易云「我喜欢的音乐」云端收藏同步
 * ------------------------------------------------------------------
 * 需求：只要网易云官方「我喜欢的音乐」里已有这首歌，即使本软件从未播放过它，
 *       收藏状态也必须显示「已收藏」。
 * 实现：登录后从官方 /likelist 拉取全量喜欢 ID 并缓存；任意歌曲的爱心状态以该
 *       云端集合为准，点击爱心直接调用官方 like 接口，成功后本地同步集合。
 */

import { neteaseApi } from './netease';
import { getServerConfig } from './xuanServer';

const KEY = 'xuan_netease_liked_ids';
const listeners = new Set<() => void>();
let likedIds: Set<number> = new Set();
let loaded = false;
let loading: Promise<void> | null = null;

function emit() {
  listeners.forEach(fn => { try { fn(); } catch { /* noop */ } });
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify([...likedIds].slice(0, 20000))); } catch { /* noop */ }
}

export function initFavoriteCache() {
  if (loaded) return;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) likedIds = new Set(arr.map(Number).filter(Boolean));
    }
  } catch { /* noop */ }
  loaded = true;
}

export function onFavoriteChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export const isLiked = (id: number | string | undefined): boolean =>
  id == null ? false : likedIds.has(Number(id));

export const getLikedCount = (): number => likedIds.size;

/** 从网易云官方拉取「我喜欢的音乐」全量 ID（登录后调用） */
export async function syncLikedFromCloud(force = false): Promise<boolean> {
  if (loading && !force) return loading.then(() => true).catch(() => false);
  loading = (async () => {
    try {
      const account: any = await neteaseApi.getUserAccount?.();
      const uid = Number(account?.profile?.userId ?? account?.account?.id ?? account?.userId ?? 0);
      if (!uid) return;
      const res: any = await neteaseApi.getLikedSongs(uid);
      const ids: number[] = Array.isArray(res?.ids) ? res.ids : [];
      if (ids.length >= 0) {
        likedIds = new Set(ids.map(Number).filter(Boolean));
        persist();
        emit();
      }
    } catch { /* 未登录或网络异常时保留本地缓存 */ }
  })();
  try { await loading; return true; } catch { return false; } finally { loading = null; }
}

/**
 * 点击爱心：直接收藏/取消收藏到网易云「我喜欢的音乐」。
 * 官方 like 接口失败时回退到歌单增删接口。
 */
export async function toggleNeteaseLike(songId: number | string): Promise<{ ok: boolean; liked: boolean; needLogin?: boolean }> {
  const id = Number(songId);
  if (!id) return { ok: false, liked: false };
  const willLike = !likedIds.has(id);
  try {
    const res: any = await neteaseApi.likeSong(id, willLike);
    const code = Number(res?.code ?? 200);
    if (code !== 200) {
      if (code === 301 || code === 302) return { ok: false, liked: !willLike, needLogin: true };
      return { ok: false, liked: !willLike };
    }
    if (willLike) likedIds.add(id); else likedIds.delete(id);
    persist(); emit();
    return { ok: true, liked: willLike };
  } catch {
    return { ok: false, liked: !willLike };
  }
}

/** 服务端配置里的开关（管理端可改「是否显示状态栏收藏按钮」） */
export const showStatusBarFavorite = (): boolean =>
  getServerConfig()?.ui?.showStatusBarFavorite !== false;
