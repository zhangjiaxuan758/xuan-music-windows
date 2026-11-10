import { useEffect, useState } from 'react';
import type { SongResult } from '../types';
import { getCachedCoverUrl, loadCachedOrFetchCover } from '../services/coverCache';
import { getSongResourceCacheKey } from '../services/onlineMusic/resourceKeys';

// 小轩音乐 · 缓存感知封面
// - 有网络：直接用远程地址显示（即时），并在后台把封面写入缓存（「第一时间缓存」）。
// - 无网络：优先从本地缓存取已缓存的封面显示，避免裂图或显示旧图。
// 其余行为（占位 spinner、淡入、不可选中等）由调用方传入的 onLoad / className 保持原样。
export function CachedCoverImg({
    coverUrl,
    song,
    alt,
    className,
    imgRef,
    onImgLoad,
    loading = 'lazy',
}: {
    coverUrl?: string | null;
    song?: SongResult | null;
    alt: string;
    className?: string;
    imgRef?: (el: HTMLImageElement | null) => void;
    onImgLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
    loading?: 'lazy' | 'eager';
}) {
    const [resolved, setResolved] = useState<string | undefined>(coverUrl ?? undefined);

    useEffect(() => {
        let cancelled = false;
        if (!coverUrl) {
            setResolved(undefined);
            return;
        }
        const online = typeof navigator === 'undefined' || navigator.onLine !== false;
        const cacheKey = song ? getSongResourceCacheKey('cover', song) : null;

        if (!online && cacheKey) {
            // 断网：先尝试用本地已缓存封面。
            getCachedCoverUrl(cacheKey)
                .then(url => { if (!cancelled && url) setResolved(url); })
                .catch(() => { /* 无缓存则交给全局离线图片守卫兜底 */ });
        } else {
            setResolved(coverUrl);
            // 有网：后台把封面写入缓存（仅在尚未缓存时拉取），供断网后回退。
            if (online && cacheKey) {
                getCachedCoverUrl(cacheKey)
                    .then(existing => {
                        if (!cancelled && !existing) {
                            void loadCachedOrFetchCover(cacheKey, coverUrl).catch(() => { /* 缓存失败不影响显示 */ });
                        }
                    })
                    .catch(() => { /* 忽略 */ });
            }
        }
        return () => { cancelled = true; };
    }, [coverUrl, song]);

    if (!resolved) return null;
    return (
        <img
            src={resolved}
            alt={alt}
            loading={loading}
            decoding="async"
            ref={imgRef}
            onLoad={onImgLoad}
            className={className}
        />
    );
}
