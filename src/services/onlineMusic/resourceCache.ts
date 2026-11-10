import type { SongResult } from '../../types';
import type { MigrationResult } from '../../utils/lyrics/renderHints';
import { getCachedAudioBlob, hasCachedAudio, saveAudioBlob } from '../audioCache';
import { getCachedCoverUrl, saveCoverBlob } from '../coverCache';
import { getFromCache, saveToCache } from '../db';
import { useOnlineProviderAccountStore } from '../../stores/useOnlineProviderAccountStore';
import { getLegacySongResourceCacheKeys, getSongResourceCacheKey, type SongResourceKind } from './resourceKeys';

// src/services/onlineMusic/resourceCache.ts

const identityMigration = <T>(value: T): MigrationResult<T> => ({ value, changed: false });

/** 是否为网易云会员歌曲（需会员/付费才能听完整版）。fee: 1=VIP、4=付费数字专辑。 */
export const isNeteaseVipSong = (song: SongResult): boolean => {
    const fee = Number((song as { fee?: unknown; privilege?: { fee?: unknown } })?.fee
        ?? (song as { privilege?: { fee?: unknown } })?.privilege?.fee ?? 0);
    return fee >= 1;
};

/** 当前是否已登录且为网易云真实会员（vipType > 0 才视为会员，未知/0 一律按非会员）。 */
export const isCurrentNeteaseVipUser = (): boolean => {
    const accountUser = useOnlineProviderAccountStore.getState().accounts?.['netease']?.user;
    const vipType = Number(accountUser?.vipType ?? 0);
    return vipType > 0;
};

/**
 * 会员歌曲的音频缓存按会员状态分桶，避免「非会员的试听缓存被会员当成完整版放」、
 * 或「会员的完整缓存被非会员直接放出来」：
 * - 会员歌曲 + 非会员：缓存试听版（key 带 :trial）
 * - 会员歌曲 + 会员：缓存完整版（key 带 :vip）
 * - 非会员歌曲（无需会员）：一律完整版，key 不带后缀
 * 播放时取链接口拿到什么就缓存什么（非会员拿试听 URL、会员拿完整 URL），
 * 这里只负责让两套缓存互不串味。
 */
export const getSongAudioCacheKey = (song: SongResult): string => {
    const base = getSongResourceCacheKey('audio', song);
    if (!isNeteaseVipSong(song)) return base; // 无需会员的歌永远缓存完整版
    return `${base}${isCurrentNeteaseVipUser() ? ':vip' : ':trial'}`;
};

// Reads legacy NetEase entries once and writes them back under the provider-aware key.
export const getSongCacheWithLegacyMigration = async <T>(
    kind: SongResourceKind,
    song: SongResult,
    migrate: (value: T) => MigrationResult<T> = identityMigration,
): Promise<T | null> => {
    const cacheKey = getSongResourceCacheKey(kind, song);
    const current = await getFromCache<T>(cacheKey);
    if (current != null) {
        const migrated = migrate(current);
        if (migrated.changed) void saveToCache(cacheKey, migrated.value);
        return migrated.value;
    }

    for (const legacyKey of getLegacySongResourceCacheKeys(kind, song)) {
        const legacy = await getFromCache<T>(legacyKey);
        if (legacy == null) continue;
        const migrated = migrate(legacy);
        await saveToCache(cacheKey, migrated.value);
        return migrated.value;
    }
    return null;
};

export const getCachedSongAudioBlob = async (song: SongResult): Promise<Blob | null> => {
    const cacheKey = getSongAudioCacheKey(song);
    const current = await getCachedAudioBlob(cacheKey);
    if (current) return current;

    for (const legacyKey of getLegacySongResourceCacheKeys('audio', song)) {
        const legacy = await getCachedAudioBlob(legacyKey);
        if (!legacy) continue;
        await saveAudioBlob(cacheKey, legacy);
        return legacy;
    }
    return null;
};

export const hasCachedSongAudio = async (song: SongResult): Promise<boolean> => (
    Boolean(await getCachedSongAudioBlob(song))
);

export const getCachedSongCoverUrl = async (song: SongResult): Promise<string | null> => {
    const cacheKey = getSongResourceCacheKey('cover', song);
    const current = await getCachedCoverUrl(cacheKey);
    if (current) return current;

    for (const legacyKey of getLegacySongResourceCacheKeys('cover', song)) {
        const legacyUrl = await getCachedCoverUrl(legacyKey);
        if (!legacyUrl) continue;
        try {
            const legacyBlob = await (await fetch(legacyUrl)).blob();
            await saveCoverBlob(cacheKey, legacyBlob);
        } catch (error) {
            console.warn('[ResourceCache] Failed to write back legacy cover cache', error);
        }
        return legacyUrl;
    }
    return null;
};
