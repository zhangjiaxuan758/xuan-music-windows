/**
 * 小轩音乐 · 启动即缓存
 * ------------------------------------------------------------------
 * 进入客户端后立刻预热「歌曲封面 + 其他需缓存的静态资源」，
 * 不再等用户点进「开发者推荐 / 榜单」那两个板块才触发缓存。
 * 所有写入都复用现有封面缓存（IndexedDB/OPFS + Cache API 双写），
 * 设置里原有的「清除缓存」会一并清掉（见 clearStartupStaticCaches）。
 */
import { loadCachedOrFetchCover } from './coverCache';
import { getSongResourceCacheKey } from './onlineMusic/resourceKeys';
import { getDeveloperRecommendedSongs, DEV_RECOMMENDED_SONGS } from './onlineMusic/devRecommend';
import { getXuanCharts, getXuanChartSongs } from './onlineMusic/charts';
import type { SongResult } from '../types';

export const XUAN_STATIC_COVERS_CACHE = 'xuan-static-covers-v1';
const STARTUP_ASSETS_CACHE = 'xuan-startup-assets-v1';
const WARMUP_FLAG = 'xuan_startup_warmup_v2';

/** 静态页面 / 图标：进客户端就缓存，断网时静态页与图标不裂。 */
const STARTUP_ASSETS = [
    '/index.html', '/help.html', '/favicon.ico', '/favicon.png',
    '/apple-touch-icon.png', '/icon.svg',
];

const coverUrlOf = (song: SongResult | null | undefined): string => {
    if (!song) return '';
    const raw: any = song as any;
    const url = raw?.album?.coverUrl || raw?.coverUrl || raw?.picUrl || '';
    return typeof url === 'string' ? url.replace(/^http:/, 'https:') : '';
};

const warmCover = async (song: SongResult): Promise<void> => {
    const url = coverUrlOf(song);
    if (!url) return;
    try {
        await loadCachedOrFetchCover(getSongResourceCacheKey('cover', song), url);
    } catch { /* 单张封面失败不影响其余预热 */ }
};

/** 读取首页已写入的离线静态列表（断网兜底数据也要参与预热）。 */
const readOfflineSongs = (kind: 'chart' | 'dev', id: number | string): SongResult[] => {
    try {
        const raw = localStorage.getItem(`xuan_static_${kind}_${id}`);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as { songs?: SongResult[] };
        return Array.isArray(parsed.songs) ? parsed.songs : [];
    } catch { return [] }
};

/** 有限并发，避免启动时把网络打满影响起播。 */
const mapLimit = async <T,>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> => {
    const queue = [...items];
    const runners = Array.from({ length: Math.min(limit, Math.max(1, queue.length)) }, async () => {
        while (queue.length) {
            const item = queue.shift();
            if (item !== undefined) await worker(item);
        }
    });
    await Promise.all(runners);
};

const warmStaticAssets = async (): Promise<void> => {
    if (typeof caches === 'undefined') return;
    try {
        const cache = await caches.open(STARTUP_ASSETS_CACHE);
        await Promise.all(STARTUP_ASSETS.map(async (path) => {
            try {
                if (await cache.match(path)) return;
                const resp = await fetch(path, { cache: 'no-store' });
                if (resp.ok) await cache.put(path, resp.clone());
            } catch { /* noop */ }
        }));
    } catch { /* noop */ }
};

let inFlight: Promise<void> | null = null;

/**
 * 启动预热入口。App 挂载后调用一次；SSE 配置更新时再强制跑一次。
 * sessionStorage 标记保证一次会话只跑一次（切后台回前台不重复拉取）。
 */
export const warmupStartupCaches = (force = false): Promise<void> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve();
    if (inFlight) return inFlight;
    if (!force) {
        try { if (sessionStorage.getItem(WARMUP_FLAG) === '1') return Promise.resolve(); } catch { /* noop */ }
    }
    inFlight = (async () => {
        try { sessionStorage.setItem(WARMUP_FLAG, '1'); } catch { /* noop */ }

        const songs: SongResult[] = [];
        const seen = new Set<string>();

        // 1) 开发者推荐（管理端下发或本地兜底），整份列表封面第一时间缓存。
        try {
            const dev = await getDeveloperRecommendedSongs();
            const list = dev.length ? dev : DEV_RECOMMENDED_SONGS.map(meta => ({
                id: meta.id, name: meta.name, artists: [{ id: 0, name: meta.artist }],
                album: { id: 0, name: '', coverUrl: '' }, durationMs: 0,
                sourceRef: { kind: 'online', providerId: 'netease', mediaId: String(meta.id) },
            } as unknown as SongResult));
            list.forEach(s => { if (!seen.has(String(s.id))) { seen.add(String(s.id)); songs.push(s); } });
        } catch { /* 接口失败不阻塞其余预热 */ }

        // 2) 榜单：有网直接拉，断网/失败就用已缓存的静态列表。
        let charts: Record<string, { id: number; name: string }> = {};
        try { charts = getXuanCharts(); } catch { /* noop */ }
        const chartIds = Object.keys(charts);
        await mapLimit(chartIds, 2, async (id) => {
            let list: SongResult[] = [];
            try { list = await getXuanChartSongs(id as any); } catch { /* noop */ }
            if (!list.length) list = readOfflineSongs('chart', charts[id]?.id ?? id);
            list.slice(0, 24).forEach(s => {
                const key = String(s.id);
                if (!seen.has(key)) { seen.add(key); songs.push(s); }
            });
        });
        readOfflineSongs('dev', 'main').forEach(s => {
            if (!seen.has(String(s.id))) { seen.add(String(s.id)); songs.push(s); }
        });

        // 3) 封面并发预热 + 静态资源缓存。
        await mapLimit(songs, 4, warmCover);
        await warmStaticAssets();
    })().finally(() => { inFlight = null; });
    return inFlight;
};

/** 设置 → 清除缓存：把启动预热写入的 Cache API 内容一并清掉。 */
export const clearStartupStaticCaches = async (): Promise<void> => {
    try { sessionStorage.removeItem(WARMUP_FLAG); } catch { /* noop */ }
    if (typeof caches === 'undefined') return;
    await Promise.all([XUAN_STATIC_COVERS_CACHE, STARTUP_ASSETS_CACHE]
        .map(name => caches.delete(name).catch(() => false)));
};
