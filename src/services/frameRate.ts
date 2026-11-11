// 小轩音乐 · 帧率控制（仅 Android 客户端）
// --------------------------------------------------------------------
// 默认使用设备最高刷新率（无上限：165/180/240… 均跟随设备）；设置里可切换
// 30/60/…/设备任意支持档（不支持的档不显示，最低 30）。
// 原生端通过 preferredDisplayModeId 选择同分辨率下最接近目标帧率的显示模式。
import { Capacitor, registerPlugin } from '@capacitor/core';

export const FRAME_RATE_STORAGE_KEY = 'xuan_frame_rate';
// 0 = 自动（设备最高帧率，无上限）；≥30 = 手动指定任意设备支持档
export type FrameRatePref = number;

interface XuanNativeFrameRate {
  getSupportedFrameRates(): Promise<{ rates: number[] }>;
  setFrameRate(opts: { fps: number }): Promise<{ fps: number }>;
}

const native = (): XuanNativeFrameRate | null => {
  // 原生插件通过 Capacitor 注册，不会自动挂到 window.XuanNative；
  // 旧实现查 window 恒为 null，导致 getSupportedFrameRates() 返回空数组、
  // 设置里的「切换帧率」整块被隐藏。这里改为按插件名解析。
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return registerPlugin<XuanNativeFrameRate>('XuanNative');
  } catch {
    return null;
  }
};

export const readFrameRatePref = (): FrameRatePref => {
  try {
    const v = Number(localStorage.getItem(FRAME_RATE_STORAGE_KEY) ?? '0');
    // 无上限：任意 ≥30 的设备档位均可保存（165/180/240…），0 = 自动最高
    return (Number.isFinite(v) && (v === 0 || v >= 30)) ? v : 0;
  } catch { return 0; }
};

export const writeFrameRatePref = (fps: FrameRatePref) => {
  try { localStorage.setItem(FRAME_RATE_STORAGE_KEY, String(fps)); } catch { /* noop */ }
  void applyFrameRate();
};

/** 设备支持的档位（原生取整升序）；网页端/桌面返回空数组（UI 隐藏该设置）。 */
export const getSupportedFrameRates = async (): Promise<number[]> => {
  const n = native();
  if (!n) return [];
  try {
    const { rates } = await n.getSupportedFrameRates();
    return Array.isArray(rates) ? rates.filter(r => r >= 30).sort((a, b) => a - b) : [];
  } catch { return []; }
};

/** 应用当前偏好：0 = 跟随设备最高 */
export const applyFrameRate = async (): Promise<void> => {
  const n = native();
  if (!n) return;
  const pref = readFrameRatePref();
  try {
    if (pref === 0) {
      const rates = await getSupportedFrameRates();
      const max = rates.length ? rates[rates.length - 1] : 0;
      if (max >= 30) await n.setFrameRate({ fps: max });
    } else {
      await n.setFrameRate({ fps: pref });
    }
  } catch { /* noop */ }
};
