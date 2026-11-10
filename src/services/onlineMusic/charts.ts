// 小轩音乐：网易云官方实时榜单（动态读取服务端配置，管理端改了立即生效）。
// 榜单 ID 取自官方 /api/toplist/detail，曲目通过官方 /api/playlist/track/all 实时拉取，
// 未登录也能浏览；会员 / 付费 / 无版权歌曲沿用与搜索完全一致的官方受限提示。
//
// 重要：绝不在模块加载时把配置求值成常量，否则管理端改榜单 ID / 加新榜后，
// 客户端会一直读死旧值，重启也不会同步。
import { neteaseApi } from '../netease';
import type { SongResult } from '../../types';
import { getServerConfig } from '../xuanServer';

export type XuanChartId = string;

/** 兜底默认：仅在首次启动 / 配置尚未下发时使用，与服务端 DEFAULT_CONFIG.charts 一致。 */
export const FALLBACK_CHARTS: Record<string, { id: number; name: string }> = {
    hotChart:       { id: 3778678,     name: '热歌榜' },
    gufengChart:    { id: 5059642708,  name: '古风榜' },
    myHotChart:     { id: 6723173524,  name: '我的热榜' },
    euHotChart:     { id: 2809513713,  name: '欧美热歌榜' },
    acgChart:       { id: 71385702,    name: 'ACG榜' },
    koreanChart:    { id: 745956260,   name: '韩语榜' },
    soaringChart:   { id: 19723756,    name: '飙升榜' },
    japaneseChart:  { id: 5059644681,  name: '日语榜' },
    newSongChart:   { id: 3779629,     name: '新歌榜' },
    rockChart:      { id: 5059633707,  name: '摇滚榜' },
    folkChart:      { id: 5059661515,  name: '民谣榜' },
    originalChart:  { id: 2884035,     name: '原创榜' },
    rapChart:       { id: 991319590,   name: '说唱榜' },
    audiobookChart: { id: 912202619,  name: '听书榜' },
    podcastChart:   { id: 12450350065, name: '播客榜' },
};

/** 每次调用都读最新服务端配置（管理端保存 → SSE 热更新 → 这里立刻拿到新值）。 */
export const getXuanCharts = (): Record<string, { id: number; name: string }> => {
    try {
        const remote = getServerConfig()?.charts;
        if (remote && typeof remote === 'object') {
            const out: Record<string, { id: number; name: string }> = {};
            for (const [k, v] of Object.entries(remote)) {
                const id = Number((v as any)?.playlistId);
                if (Number.isFinite(id) && id > 0) {
                    out[k] = { id, name: String((v as any)?.label || k) };
                }
            }
            if (Object.keys(out).length) return out;
        }
    } catch { /* noop */ }
    return FALLBACK_CHARTS;
};

/** 兼容旧引用：属性访问时重新求值，任何地方都不会读死旧配置。 */
export const XUAN_CHARTS: Record<string, { id: number; name: string }> = new Proxy({} as any, {
    get: (_t, key: string) => getXuanCharts()[key],
    has: (_t, key: string) => key in getXuanCharts(),
    ownKeys: () => Reflect.ownKeys(getXuanCharts()),
    getOwnPropertyDescriptor: (_t, key) => {
        const all = getXuanCharts();
        return key in all
            ? { enumerable: true, configurable: true, value: all[key as string] }
            : undefined;
    },
});

const fallbackSong = (raw: any): SongResult => ({
    id: Number(raw?.id) || 0,
    name: String(raw?.name || ''),
    artists: (raw?.ar || raw?.artists || []).map((a: any) => ({ id: a.id || 0, name: a.name || '' })),
    album: { id: 0, name: raw?.al?.name || '', coverUrl: raw?.al?.picUrl || '' },
    durationMs: Number(raw?.dt || 0),
    fee: Number(raw?.fee ?? 0),
    privilege: raw?.privilege,
    resourceState: raw?.resourceState,
    noCopyrightRcmd: raw?.noCopyrightRcmd,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: String(raw?.id || '') },
} as SongResult);

/** 实时从网易云官方拉取榜单前 50 首，字段与搜索结果一致（fee / privilege 等完整保留）。 */
export const getXuanChartSongs = async (chart: XuanChartId): Promise<SongResult[]> => {
    const def = getXuanCharts()[chart];
    if (!def) return [];
    try {
        const res: any = await neteaseApi.getPlaylistTracks(def.id, 50, 0);
        const raws: any[] = Array.isArray(res?.songs) ? res.songs
            : Array.isArray(res?.playlist?.tracks) ? res.playlist.tracks : [];
        return raws.filter(s => s && s.id != null).map(raw => {
            try {
                const normalized = neteaseApi.normalizeSongResult(raw);
                return {
                    ...normalized,
                    fee: Number(raw.fee ?? normalized.fee ?? 0),
                    privilege: raw.privilege ?? normalized.privilege,
                    resourceState: raw.resourceState ?? normalized.resourceState,
                    noCopyrightRcmd: raw.noCopyrightRcmd ?? normalized.noCopyrightRcmd,
                    sourceRef: { kind: 'online' as const, providerId: 'netease' as const, mediaId: String(raw.id) },
                } as SongResult;
            } catch {
                return fallbackSong(raw);
            }
        });
    } catch (error) {
        console.warn('[XuanChart] official chart unavailable', chart, error);
        return [];
    }
};
