import { getFromCache, removeFromCache, saveToCache } from './db';
import { createSafeObjectUrl, isBlob } from '../utils/blobGuards';
import {
    clearCoverAssets,
    getCoverAssetUsage,
    readCoverAsset,
    removeCoverAsset,
    writeCoverAsset,
    type BinaryAssetWriteResult,
} from './binaryAssetStore';
import { resolveFoliaApiUrl } from './webApi';

interface StoredCoverDescriptor extends BinaryAssetWriteResult { }

const isStoredCoverDescriptor = (value: unknown): value is StoredCoverDescriptor => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<StoredCoverDescriptor>;
    return (candidate.backend === 'opfs' || candidate.backend === 'electron')
        && typeof candidate.mimeType === 'string'
        && typeof candidate.size === 'number'
        && typeof candidate.updatedAt === 'number';
};

const buildCoverRequestUrl = (coverUrl: string): string => {
    if (typeof window !== 'undefined' && window.electron) return coverUrl;
    try {
        const hostname = new URL(coverUrl).hostname;
        if (hostname === 'y.gtimg.cn'
            || hostname === 'kugou.com' || hostname.endsWith('.kugou.com')
            || hostname === 'kgimg.com' || hostname.endsWith('.kgimg.com')) {
            return resolveFoliaApiUrl(`lyric-proxy?url=${encodeURIComponent(coverUrl)}`);
        }
    } catch {
        return coverUrl;
    }
    return coverUrl;
};

const fetchCoverBlob = async (coverUrl: string): Promise<Blob> => {
    const response = await fetch(buildCoverRequestUrl(coverUrl), { mode: 'cors' });
    if (response.ok === false) throw new Error(`Cover request failed: ${response.status}`);
    return await response.blob();
};

export async function getCachedCoverUrl(cacheKey: string): Promise<string | null> {
    const stored = await getFromCache<unknown>(cacheKey);
    if (isBlob(stored)) {
        const descriptor = await writeCoverAsset(cacheKey, stored).catch(() => null);
        if (!descriptor) {
            return createSafeObjectUrl(stored);
        }
        await saveToCache(cacheKey, descriptor);
        return createSafeObjectUrl(stored);
    }

    if (stored !== null && !isStoredCoverDescriptor(stored)) {
        await removeFromCache(cacheKey);
        await removeCoverAsset(cacheKey);
        return null;
    }

    const cachedCover = await readCoverAsset(cacheKey, isStoredCoverDescriptor(stored) ? stored.mimeType : undefined);
    if (!cachedCover) {
        if (stored) await removeFromCache(cacheKey);
        return null;
    }
    return createSafeObjectUrl(cachedCover);
}

const COVER_STATIC_CACHE = 'xuan-static-covers-v1';

/** Cache API 读取离线封面（二进制资产库之外的第二重兜底）。 */
const readCoverFromStaticCache = async (coverUrl: string): Promise<Blob | null> => {
    try {
        if (typeof caches === 'undefined') return null;
        const cache = await caches.open(COVER_STATIC_CACHE);
        const hit = await cache.match(coverUrl);
        if (!hit) return null;
        const blob = await hit.blob();
        return blob.size > 0 ? blob : null;
    } catch { return null; }
};

/** 联网拿到封面后同时写 Cache API，之后断网也能取回。 */
const writeCoverToStaticCache = async (coverUrl: string, blob: Blob): Promise<void> => {
    try {
        if (typeof caches === 'undefined') return;
        const cache = await caches.open(COVER_STATIC_CACHE);
        await cache.put(coverUrl, new Response(blob, {
            headers: { 'Content-Type': blob.type || 'image/jpeg' },
        }));
    } catch { /* noop */ }
};

export async function loadCachedOrFetchCover(cacheKey: string, coverUrl?: string | null): Promise<string | null> {
    if (!coverUrl) return null;

    // 1) 二进制资产库（IndexedDB / OPFS）优先，离线可用。
    try {
        const cachedCoverUrl = await getCachedCoverUrl(cacheKey);
        if (cachedCoverUrl) return cachedCoverUrl;
    } catch { /* noop */ }

    // 2) 联网获取并双写，保证之后断网仍可显示。
    try {
        const coverBlob = await fetchCoverBlob(coverUrl);
        const descriptor = await writeCoverAsset(cacheKey, coverBlob).catch(() => null);
        if (descriptor) await saveToCache(cacheKey, descriptor);
        await writeCoverToStaticCache(coverUrl, coverBlob);
        return createSafeObjectUrl(coverBlob) || coverUrl;
    } catch (error) {
        // 3) 断网 / 请求失败：从静态资源缓存读回，避免「图片损坏」裂图。
        try {
            const blob = await readCoverFromStaticCache(coverUrl);
            if (blob) {
                const descriptor = await writeCoverAsset(cacheKey, blob).catch(() => null);
                if (descriptor) await saveToCache(cacheKey, descriptor);
                const objectUrl = createSafeObjectUrl(blob);
                if (objectUrl) return objectUrl;
            }
        } catch { /* noop */ }
        console.warn('Failed to cache cover (offline):', error);
        // 交给全局离线图片守卫兜底显示中性占位图
        return coverUrl;
    }
}

export async function saveCoverBlob(cacheKey: string, coverBlob: Blob): Promise<void> {
    const descriptor = await writeCoverAsset(cacheKey, coverBlob).catch(() => null);
    if (descriptor) {
        await saveToCache(cacheKey, descriptor);
        return;
    }
    await saveToCache(cacheKey, coverBlob);
}

// Replaces the cached online cover used by local-song playback without changing the audio file.
export async function cacheLocalSongOnlineCover(songId: string, coverUrl: string): Promise<boolean> {
    const cacheKey = `cover_local_${songId}`;
    await removeCachedCover(cacheKey);
    try {
        const descriptor = await writeCoverAsset(cacheKey, await fetchCoverBlob(coverUrl));
        if (!descriptor) return false;
        await saveToCache(cacheKey, descriptor);
        return true;
    } catch (error) {
        console.warn('[LocalMusic] Failed to cache matched cover:', error);
        return false;
    }
}

export async function removeCachedCover(cacheKey: string): Promise<void> {
    await Promise.all([removeFromCache(cacheKey), removeCoverAsset(cacheKey)]);
}

export { clearCoverAssets, getCoverAssetUsage };
