import { neteaseApi } from '../netease';
import { getServerConfig } from '../xuanServer';
import type { SongResult } from '../../types';

// 「开发者推荐」固定歌单：曲目由开发者指定，ID 取自网易云官方 eapi 搜索结果。
// 顺序即展示顺序（九万字为第一首）；壁上观指定鞠婧祎版，牵丝戏指定银临/Aki阿杰原唱版。
export interface DevRecommendedSongMeta {
    id: number;
    name: string;
    artist: string;
}

// 离线兜底常量；运行时由服务端 config.developerPicks 实时覆盖（管理端可改）
export const DEV_RECOMMENDED_SONGS: DevRecommendedSongMeta[] = [
    { id: 1335942780, name: '九万字', artist: '黄诗扶' },
    { id: 486188225,  name: '刚好遇见你', artist: '李玉刚' },
    { id: 449818741,  name: '光年之外', artist: 'G.E.M.邓紫棋' },
    { id: 29357087,   name: '寂寞烟火', artist: '朱婧汐' },
    { id: 346576,     name: '光辉岁月', artist: 'Beyond' },
    { id: 347230,     name: '海阔天空', artist: 'Beyond' },
    { id: 32701152,   name: '灰色轨迹', artist: 'Beyond' },
    { id: 3457895837, name: '醉千年（那时车马慢一生只够爱一人）', artist: '池澜/灰蒙蒙' },
    { id: 2638631898, name: '壁上观', artist: '鞠婧祎' },
    { id: 3330620554, name: '琵琶曲', artist: '郑浩Z-Hao/冰洁' },
    { id: 2027999725, name: '苏幕遮', artist: '张晓棠' },
    { id: 30352891,   name: '牵丝戏', artist: '银临/Aki阿杰' },
    { id: 1454730043, name: '赤伶', artist: '李玉刚' },
    { id: 2617279387, name: '花雨弄', artist: '粉笔' },
    { id: 1808078153, name: '沈园外', artist: '阿YueYue/戾格/小田音乐社' },
    { id: 2727006409, name: '青衣', artist: '尘ah.' },
    { id: 2727001775, name: '青衣 (DJ版)', artist: '尘ah.' },
];

// 官方 /api/v3/song/detail 不可用时的兜底：仍能让列表可见，点击播放时按 ID 重新取链。
const fallbackSong = (meta: DevRecommendedSongMeta): SongResult => ({
    id: meta.id,
    name: meta.name,
    artists: [{ id: 0, name: meta.artist }],
    album: { id: 0, name: '', coverUrl: '' },
    durationMs: 0,
    sourceRef: {
        kind: 'online',
        providerId: 'netease',
        mediaId: String(meta.id),
    },
});

/**
 * 一次性从官方批量拉取 12 首推荐歌曲的完整元数据（封面、时长、fee、privilege 等）。
 * 元数据里的 fee / privilege 会直接喂给现有播放层，会员 / 付费 / 试听 / 无版权
 * 的判定与官方口径保持一致，不需要在推荐页另写一套权限逻辑。
 */
export const getDeveloperRecommendedSongs = async (): Promise<SongResult[]> => {
    const remote = getServerConfig()?.developerPicks;
    const picks: DevRecommendedSongMeta[] = (remote && remote.length ? remote : DEV_RECOMMENDED_SONGS)
        .map(s => ({ id: Number(s.id) || 0, name: String(s.name || ''), artist: String(s.artist || '') }))
        .filter(s => s.id > 0);
    try {
        const response = await neteaseApi.getSongDetail(picks.map(song => song.id));
        const rawSongs: any[] = Array.isArray(response?.songs) ? response.songs : [];
        const byId = new Map<string, any>(
            rawSongs
                .filter(song => song && song.id != null)
                .map(song => [String(song.id), song]),
        );
        return picks.map(meta => {
            const raw = byId.get(String(meta.id));
            if (!raw) return fallbackSong(meta);
            try {
                const normalized = neteaseApi.normalizeSongResult(raw);
                return {
                    ...normalized,
                    fee: Number(raw.fee ?? normalized.fee ?? 0),
                    privilege: raw.privilege ?? normalized.privilege,
                    resourceState: raw.resourceState ?? normalized.resourceState,
                    noCopyrightRcmd: raw.noCopyrightRcmd ?? normalized.noCopyrightRcmd,
                    sourceRef: {
                        kind: 'online' as const,
                        providerId: 'netease' as const,
                        mediaId: String(meta.id),
                    },
                } as SongResult;
            } catch {
                return fallbackSong(meta);
            }
        });
    } catch (error) {
        console.warn('[DevRecommend] official song/detail unavailable, using local metadata', error);
        return DEV_RECOMMENDED_SONGS.map(fallbackSong);
    }
};
