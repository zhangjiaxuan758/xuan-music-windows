/**
 * 播放遥控桥
 * ------------------------------------------------------------------
 * 把 App 层的播放控制（上一首 / 下一首 / 播放暂停 / 收藏）注册为全局能力，
 * 供进度条按钮、状态栏媒体通知、网页端 Media Session 统一调用，
 * 避免层层透传 props 改动大量既有组件。
 */

export interface PlayerRemoteControls {
  prev: () => void;
  next: () => void;
  toggle: () => void;
  like: () => void;
  getState: () => { playing: boolean; songName: string; artist: string; cover: string | null; liked: boolean; loggedIn: boolean };
}

let controls: PlayerRemoteControls | null = null;
const listeners = new Set<() => void>();

export function registerPlayerRemote(c: PlayerRemoteControls) {
  controls = c;
  listeners.forEach(fn => { try { fn(); } catch { /* noop */ } });
}

export function onPlayerRemoteChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export const playerRemote = {
  prev: () => controls?.prev(),
  next: () => controls?.next(),
  toggle: () => controls?.toggle(),
  like: () => controls?.like(),
  getState: () => controls?.getState() ?? { playing: false, songName: '', artist: '', cover: null, liked: false, loggedIn: false },
  isReady: () => Boolean(controls),
};
