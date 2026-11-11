import { getFromCache, removeFromCache, saveToCache } from './db';
import { isBlob } from '../utils/blobGuards';

interface ElectronAudioCacheEntry {
  found: boolean;
  data?: Uint8Array | ArrayBuffer | null;
  mimeType?: string | null;
}

// ---------------------------------------------------------------- base64 解码 Worker
// 整首歌的 base64（10MB 级）如果用 atob + charCodeAt 循环在主线程解码，
// 会阻塞数百毫秒 —— 正好压在 ScriptProcessorNode 的音频时隙上，听感就是
// 「播放途中突然一阵咔哒杂音」。挪进 Worker 后主线程零阻塞。
let decodeWorker: Worker | null = null;
const pendingDecodes = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>();

const getDecodeWorker = (): Worker | null => {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return null;
  if (decodeWorker) return decodeWorker;
  try {
    const src = `
self.onmessage = function (e) {
  var id = e.data.id, base64 = e.data.base64, mime = e.data.mime;
  try {
    var bin = atob(base64);
    var len = bin.length;
    var CHUNK = 1 << 20;
    var parts = [];
    for (var off = 0; off < len; off += CHUNK) {
      var seg = bin.substring(off, Math.min(off + CHUNK, len));
      var u8 = new Uint8Array(seg.length);
      for (var i = 0; i < seg.length; i++) u8[i] = seg.charCodeAt(i);
      parts.push(u8.buffer);
    }
    self.postMessage({ id: id, ok: true, parts: parts, mime: mime });
  } catch (err) {
    self.postMessage({ id: id, ok: false, error: String(err && err.message || err) });
  }
};`;
    decodeWorker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    decodeWorker.onmessage = (ev: MessageEvent) => {
      const d = ev.data as { id: number; ok: boolean; parts?: ArrayBuffer[]; mime?: string; error?: string };
      const pending = pendingDecodes.get(d.id);
      if (!pending) return;
      pendingDecodes.delete(d.id);
      if (d.ok && d.parts && d.parts.length > 0) {
        pending.resolve(new Blob(d.parts, { type: d.mime || 'audio/mpeg' }));
      } else {
        pending.reject(new Error(d.error || 'worker decode failed'));
      }
    };
    decodeWorker.onerror = () => {
      // Worker 崩掉就清空，让后续请求回退主线程解码
      pendingDecodes.forEach(p => p.reject(new Error('decode worker crashed')));
      pendingDecodes.clear();
      decodeWorker = null;
    };
  } catch {
    return null;
  }
  return decodeWorker;
};

let decodeSeq = 0;

/** base64 → Blob；Worker 可用时在后台线程解码，否则回退主线程。 */
export const decodeBase64ToBlobAsync = (base64: string, mime: string): Promise<Blob> => (
  new Promise<Blob>((resolve, reject) => {
    const worker = getDecodeWorker();
    if (!worker) {
      // 主线程兜底（与旧逻辑等价）
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        resolve(new Blob([bytes.buffer as ArrayBuffer], { type: mime }));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }
    const id = ++decodeSeq;
    pendingDecodes.set(id, { resolve, reject });
    worker.postMessage({ id, base64, mime });
  })
);

const isElectronAudioCacheAvailable = () =>
  Boolean(
    window.electron &&
    typeof window.electron.getAudioCache === 'function' &&
    typeof window.electron.hasAudioCache === 'function' &&
    typeof window.electron.saveAudioCache === 'function'
  );

const toBlob = (entry: ElectronAudioCacheEntry): Blob | null => {
  if (!entry.found || !entry.data) {
    return null;
  }

  const mimeType = entry.mimeType || 'audio/mpeg';
  const blobData = entry.data instanceof ArrayBuffer ? entry.data : new Uint8Array(entry.data);
  return new Blob([blobData], { type: mimeType });
};

export async function getCachedAudioBlob(cacheKey: string): Promise<Blob | null> {
  if (isElectronAudioCacheAvailable()) {
    const electronEntry = await window.electron!.getAudioCache(cacheKey);
    const electronBlob = toBlob(electronEntry);
    if (electronBlob) {
      return electronBlob;
    }
  }

  const indexedDbValue = await getFromCache<unknown>(cacheKey);
  if (!isBlob(indexedDbValue)) {
    if (indexedDbValue != null) {
      await removeFromCache(cacheKey);
    }
    return null;
  }
  const indexedDbBlob = indexedDbValue;

  if (isElectronAudioCacheAvailable()) {
    try {
      await saveAudioBlob(cacheKey, indexedDbBlob);
      await removeFromCache(cacheKey);
    } catch (error) {
      console.warn('[AudioCache] Failed to migrate IndexedDB audio cache to Electron file cache', error);
    }
  }

  return indexedDbBlob;
}

export async function hasCachedAudio(cacheKey: string): Promise<boolean> {
  if (isElectronAudioCacheAvailable()) {
    const existsInElectronCache = await window.electron!.hasAudioCache(cacheKey);
    if (existsInElectronCache) {
      return true;
    }
  }

  const indexedDbValue = await getFromCache<unknown>(cacheKey);
  if (isBlob(indexedDbValue)) return true;
  if (indexedDbValue != null) await removeFromCache(cacheKey);
  return false;
}

export async function saveAudioBlob(cacheKey: string, blob: Blob): Promise<void> {
  if (!isBlob(blob)) {
    throw new TypeError('Audio cache only accepts Blob values');
  }
  if (isElectronAudioCacheAvailable()) {
    const buffer = await blob.arrayBuffer();
    await window.electron!.saveAudioCache(cacheKey, buffer, blob.type || 'audio/mpeg');
    return;
  }

  await saveToCache(cacheKey, blob);
}
