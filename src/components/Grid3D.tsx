import React, { useState, useEffect, useRef, useMemo } from 'react';
import { pushSearchHistory } from '../services/searchHistory';
import { XUAN_REQUEST_LOGIN_EVENT, XUAN_LOGIN_CONFIRMED_EVENT, consumePendingLogin } from '../services/onlineMusic/audioQualityGate';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, Settings, WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { resolveSearchSource, useSearchNavigationStore } from '../stores/useSearchNavigationStore';
import { getDeveloperRecommendedSongs } from '../services/onlineMusic/devRecommend';
import { getXuanChartSongs, getXuanCharts, type XuanChartId } from '../services/onlineMusic/charts';
import { getServerConfig, onServerConfigChange } from '../services/xuanServer';
import { isVipSong } from '../services/onlineMusic/songVip';
import { useSettingsUiStore } from '../stores/useSettingsUiStore';
import type { LocalLibraryCatalogSnapshot } from '../hooks/useLocalLibraryCatalog';
import { useShallow } from 'zustand/react/shallow';
import { SongResult, LocalSong, LocalPlaylist, LocalLibraryGroup, Theme, PlayerState } from '../types';
import { getNavidromeConfig, navidromeApi } from '../services/navidromeService';
import LocalGrid3DView from './app/home/LocalGrid3DView';
import NavidromeGrid3DView from './app/home/NavidromeGrid3DView';
import DesktopGrid3DSurface from './xuan-grid/DesktopGrid3DSurface';
import {
    createOnlineGridViewCollection,
    getProviderCollectionArtistLabel,
} from './app/home/gridViewCollectionAdapters';
import { importFolder, resyncAllFolders, LOCAL_MUSIC_SCAN_PROGRESS_EVENT } from '../services/localMusicService';
import { useOnlineProviderQrLogin } from '../hooks/useOnlineProviderQrLogin';
import type { OnlineProviderPlatformState } from '../hooks/useOnlineProviderPlatform';
import { omni } from '../services/onlineMusic/omni';
import { getSongCoverUrl } from '../services/onlineMusic/songMetadata';
import OnlineProviderSwitcher from './app/home/OnlineProviderSwitcher';
import OnlineProviderConnectPanel from './app/home/OnlineProviderConnectPanel';
import OnlineProviderLoginModal from './app/home/OnlineProviderLoginModal';
import { resolveOnlineProviderAccountView } from './app/home/onlineProviderAccountView';
import type { MediaId, ProviderCollection, ProviderUser } from '../types/onlineMusic';
import { supportsLocalMusicImport } from '../platform/runtime';

// src/components/Grid3D.tsx

/**
 * 榜单 / 开发者推荐的离线静态缓存：有网实时拉取成功后写入 localStorage，
 * 断网或拉取失败时回退到这里，保证「无网也能看到静态榜单、且缓存歌曲可播」。
 * 只在内存里兜底，不进 IndexedDB，避免与音频/封面缓存混在一起难以清理。
 */
const chartOfflineCacheKey = (kind: 'chart' | 'dev', id: number | string): string =>
    `xuan_static_${kind}_${id}`;

const writeStaticCache = (kind: 'chart' | 'dev', id: number | string, songs: SongResult[]): void => {
    try {
        localStorage.setItem(chartOfflineCacheKey(kind, id), JSON.stringify({ ts: Date.now(), songs }));
    } catch { /* 配额或隐私模式，忽略 */ }
};

const readStaticCache = (kind: 'chart' | 'dev', id: number | string): SongResult[] | null => {
    try {
        const raw = localStorage.getItem(chartOfflineCacheKey(kind, id));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { songs?: SongResult[] };
        return Array.isArray(parsed.songs) ? parsed.songs : null;
    } catch {
        return null;
    }
};

// VIP 判定统一走共享工具，避免各列表判定不一致导致小图标时有时无。
// Glassmorphic interactive desktop home view replacing the legacy 3D carousel.
// Supports cover sliding with auto-fading header controls and delegates GridView opening upward.

interface Grid3DProps {
    onlineProviderPlatform?: OnlineProviderPlatformState;
    onPlaySong: (song: SongResult, playlistCtx?: SongResult[], isFmCall?: boolean) => void;
    onBackToPlayer: () => void;
    onRefreshUser: () => void;
    user: ProviderUser | null;
    playlists: ProviderCollection[];
    cloudPlaylist?: ProviderCollection | null;
    currentTrack?: SongResult | null;
    isPlaying: boolean;
    onSelectPlaylist: (playlist: ProviderCollection) => void;
    onSelectAlbum: (albumId: MediaId) => void;
    onSelectArtist: (artistId: MediaId) => void;
    onSelectLocalAlbum?: (albumName: string) => void;
    onSelectLocalArtist?: (artistName: string) => void;
    localSongs: LocalSong[];
    localLibraryCatalog: LocalLibraryCatalogSnapshot;
    localPlaylists: LocalPlaylist[];
    onRefreshLocalSongs: () => void;
    onPlayLocalSong: (song: LocalSong, queue?: LocalSong[]) => void;
    onAddLocalSongToQueue?: (song: LocalSong) => void;
    localMusicState: {
        activeRow: 0 | 1 | 2 | 3;
        selectedGroup: LocalLibraryGroup | null;
        detailStack: LocalLibraryGroup[];
        detailOriginView: 'home' | 'player' | null;
        focusedFolderIndex: number;
        focusedAlbumIndex: number;
        focusedArtistIndex: number;
        focusedPlaylistIndex: number;
    };
    setLocalMusicState: React.Dispatch<React.SetStateAction<{
        activeRow: 0 | 1 | 2 | 3;
        selectedGroup: LocalLibraryGroup | null;
        detailStack: LocalLibraryGroup[];
        detailOriginView: 'home' | 'player' | null;
        focusedFolderIndex: number;
        focusedAlbumIndex: number;
        focusedArtistIndex: number;
        focusedPlaylistIndex: number;
    }>>;
    onMatchSong?: (song: LocalSong) => void;
    onPlayNavidromeSong?: (song: any, queue?: any[]) => void;
    onAddNavidromeSongsToQueue?: (songs: any[]) => void;
    onMatchNavidromeSong?: (song: any) => void;
    navidromeFocusedAlbumIndex?: number;
    setNavidromeFocusedAlbumIndex?: (index: number) => void;
    pendingNavidromeSelection?: any;
    onPendingNavidromeSelectionHandled?: () => void;
    onSearchCommitted: (query: string, sourceTab: any, replace?: boolean) => void;
    theme: Theme;
    onOpenSettings?: (initialTab?: 'help' | 'options') => void;
    navidromeEnabled?: boolean;
    onPlayAll?: (songs: SongResult[]) => void;
    onAddAllToQueue?: (songs: SongResult[]) => void;
    onAddSongToQueue?: (song: SongResult) => void;
    onOpenGridView?: (collection: any) => void;
    stageEnabled?: boolean;
    stageIsActive?: boolean;
    onOpenStagePlayer?: () => void;
    isInteractive?: boolean;
}

export const Grid3D: React.FC<Grid3DProps> = (props) => {
    const {
        onPlaySong,
        onBackToPlayer,
        onRefreshUser,
        user,
        playlists,
        cloudPlaylist = null,
        currentTrack,
        localSongs,
        localLibraryCatalog,
        localPlaylists,
        onRefreshLocalSongs,
        localMusicState,
        setLocalMusicState,
        navidromeFocusedAlbumIndex = 0,
        setNavidromeFocusedAlbumIndex,
        pendingNavidromeSelection = null,
        onPendingNavidromeSelectionHandled,
        onSearchCommitted,
        theme,
        onOpenSettings,
        navidromeEnabled = false,
        onOpenGridView,
        stageEnabled = false,
        stageIsActive = false,
        onOpenStagePlayer,
        onlineProviderPlatform,
        isInteractive = true,
    } = props;

    const { t } = useTranslation();

    // 管理端保存配置 → 服务端 SSE 热更新 → 这里自增版本号让 tab / 榜单立即重建，
    // 不再依赖「模块加载时就求值死的常量」或本地 store 的旧 boolean。
    const [configRev, setConfigRev] = useState(0);
    useEffect(() => onServerConfigChange(() => setConfigRev(v => v + 1)), []);
    const chartDefs = useMemo(() => getXuanCharts(), [configRev]);
    const chartTabIds = useMemo(() => Object.keys(chartDefs), [chartDefs]);
    const chartTabs = useMemo(() => {
        const cfg: any = getServerConfig();
        const app: Record<string, boolean> = cfg?.app || {};
        const tabs: Array<{ id: string; order: number; visible: boolean }> =
            Array.isArray(cfg?.tabs) ? cfg.tabs : [];
        return Object.keys(chartDefs)
            .filter(k => {
                const st = tabs.find(t => t.id === k);
                if (st) return st.visible !== false;
                const flag = app['show' + k[0].toUpperCase() + k.slice(1)];
                return flag !== false;
            })
            .sort((a, b) => {
                const oa = tabs.find(t => t.id === a)?.order ?? 900;
                const ob = tabs.find(t => t.id === b)?.order ?? 900;
                return oa - ob;
            })
            .map(k => ({ key: k, label: chartDefs[k].name }));
    }, [chartDefs, configRev]);
    const {
        isDaylight,
        showHomeTabPlaylist,
        showHomeTabRadio,
        showHomeTabAlbums,
        showHomeTabLocal,
        showHomeTabDevRecommend,
        showHomeTabHotChart,
        showHomeTabGufengChart,
        showHomeTabCache,
    } = useSettingsUiStore(useShallow(state => ({
        isDaylight: state.isDaylight,
        showHomeTabPlaylist: state.showHomeTabPlaylist,
        showHomeTabRadio: state.showHomeTabRadio,
        showHomeTabAlbums: state.showHomeTabAlbums,
        showHomeTabLocal: state.showHomeTabLocal,
        showHomeTabDevRecommend: state.showHomeTabDevRecommend,
        showHomeTabHotChart: state.showHomeTabHotChart,
        showHomeTabGufengChart: state.showHomeTabGufengChart,
        showHomeTabCache: state.showHomeTabCache,
    })));
    const {
        homeViewTab,
        setHomeViewTab,
        searchQuery,
        setSearchQuery,
        isSearching,
        submitSearch,
    } = useSearchNavigationStore(useShallow(state => ({
        homeViewTab: state.homeViewTab,
        setHomeViewTab: state.setHomeViewTab,
        searchQuery: state.searchQuery,
        setSearchQuery: state.setSearchQuery,
        isSearching: state.isSearching,
        submitSearch: state.submitSearch,
    })));
    const localMusicAvailable = supportsLocalMusicImport();

    useEffect(() => {
        const hidden =
            (!localMusicAvailable && homeViewTab === 'local')
            || (!showHomeTabDevRecommend && homeViewTab === 'devRecommend')
            || (chartTabIds.includes(homeViewTab) && !chartTabs.some(t => t.key === homeViewTab))
            || (!showHomeTabCache && homeViewTab === 'cache')
            || homeViewTab === 'albums';
        if (hidden) {
            setHomeViewTab('playlist');
        }
    }, [homeViewTab, localMusicAvailable, showHomeTabDevRecommend, showHomeTabCache, chartTabIds, chartTabs, setHomeViewTab]);

    const isDevRecommendTab = homeViewTab === 'devRecommend';
    const isChartTab = chartTabIds.includes(homeViewTab);
    const isCacheTab = homeViewTab === 'cache';
    const isSongListTab = isDevRecommendTab || isChartTab;
    const isOnlineTab = homeViewTab === 'playlist' || homeViewTab === 'radio' || isSongListTab || isCacheTab;
    const activeProviderId = onlineProviderPlatform?.activeProviderId || 'netease';
    const activeProviderSummary = onlineProviderPlatform?.activeProvider;
    const activeUser = activeProviderSummary?.user
        || (activeProviderId === 'netease' ? user : null);
    const activeAccountView = resolveOnlineProviderAccountView({
        provider: activeProviderSummary,
        hasUser: Boolean(activeUser),
        platformAvailable: Boolean(onlineProviderPlatform),
    });
    const activeCollections: ProviderCollection[] = activeProviderSummary?.collections || (activeProviderId === 'netease'
        ? [
            ...playlists,
            ...(cloudPlaylist ? [cloudPlaylist] : []),
        ]
        : []);
    const activeProviderNeedsRelogin = activeProviderSummary?.error === 'auth-required';

    // 从播放页返回时保留焦点卡片；只有切换 Home tab 才重置（见下方 effect）。
    const [focusedIndex, setFocusedIndex] = useState(() => {
        try { return Number(window.sessionStorage.getItem('xuan_home_focused_index')) || 0; }
        catch { return 0; }
    });
    useEffect(() => {
        try { window.sessionStorage.setItem('xuan_home_focused_index', String(focusedIndex)); } catch { /* ignore */ }
    }, [focusedIndex]);
    const gridRootRef = useRef<HTMLDivElement>(null);
    const [isLocalImporting, setIsLocalImporting] = useState(false);
    const [isLocalRefreshing, setIsLocalRefreshing] = useState(false);
    const [scanProgress, setScanProgress] = useState<{
        active: boolean;
        folderName: string;
        totalSongs: number;
        completedSongs: number;
    } | null>(null);
    const [scanDetailsExpanded, setScanDetailsExpanded] = useState(false);
    const scanProgressPercent = scanProgress?.totalSongs
        ? Math.min(100, Math.round((scanProgress.completedSongs / scanProgress.totalSongs) * 100))
        : 0;

    const [updateStatus, setUpdateStatus] = useState<any>(null);

    useEffect(() => {
        if (!window.electron?.getUpdateStatus) {
            return;
        }

        let disposed = false;

        window.electron.getUpdateStatus().then((status) => {
            if (!disposed) {
                setUpdateStatus(status);
            }
        }).catch(() => {
            if (!disposed) {
                setUpdateStatus(null);
            }
        });

        const unsubscribe = window.electron.onUpdateStatusChanged?.((status) => {
            setUpdateStatus(status);
        });

        return () => {
            disposed = true;
            unsubscribe?.();
        };
    }, []);

    const showUpdateIndicator = Boolean(
        updateStatus?.updateCheckEnabled &&
        updateStatus.availableVersion &&
        !updateStatus.updateSeen
    );

    // 只在真正切换 Home tab 时重置焦点；首次挂载（含从播放页返回后的重挂载）
    // 保留已保存的位置，不回到第一个。
    const prevHomeViewTabRef = useRef(homeViewTab);
    useEffect(() => {
        if (prevHomeViewTabRef.current !== homeViewTab) {
            prevHomeViewTabRef.current = homeViewTab;
            setFocusedIndex(0);
        }
    }, [homeViewTab]);

    useEffect(() => {
        const handleScanProgress = (event: Event) => {
            const customEvent = event as CustomEvent<{
                active: boolean;
                folderName: string;
                totalSongs: number;
                completedSongs: number;
            }>;
            setScanProgress(customEvent.detail.active ? customEvent.detail : null);
        };

        window.addEventListener(LOCAL_MUSIC_SCAN_PROGRESS_EVENT, handleScanProgress as EventListener);
        return () => window.removeEventListener(LOCAL_MUSIC_SCAN_PROGRESS_EVENT, handleScanProgress as EventListener);
    }, []);

    // Login QR State
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [loginProviderId, setLoginProviderId] = useState(activeProviderId);
    const {
        qrCodeImg,
        qrState,
        qrStatusText,
        start: startQrLogin,
        stop: stopQrLogin,
    } = useOnlineProviderQrLogin({
        providerId: loginProviderId,
        t,
        onConfirmed: async (confirmedProviderId) => {
            setShowLoginModal(false);
            if (confirmedProviderId === 'netease' && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent(XUAN_LOGIN_CONFIRMED_EVENT));
            }
            if (onlineProviderPlatform) {
                await onlineProviderPlatform.completeLogin(confirmedProviderId);
            } else {
                onRefreshUser();
            }
        },
    });

    const initLogin = async (providerId = activeProviderId) => {
        const summary = onlineProviderPlatform?.providers.find(provider => provider.providerId === providerId);
        if (summary && !summary.availability.configured) return;
        setLoginProviderId(providerId);
        setShowLoginModal(true);
        await startQrLogin(providerId);
    };

    // 音质门槛等处通过全局事件唤起扫码登录弹窗（AccountTab 在播放面板，
    // 登录弹窗在首页，二者不在同一组件树）。
    // 两条触发路径：① 首页已挂载时响应事件；② 首页此前被卸载（播放页），
    // 切回首页后挂载时消费 pending 标记。consumePendingLogin 先删标记再返回，
    // 保证只弹一次。
    const initLoginRef = useRef(initLogin);
    initLoginRef.current = initLogin;
    useEffect(() => {
        const trigger = () => {
            if (consumePendingLogin()) void initLoginRef.current('netease');
        };
        trigger(); // 挂载即检查（覆盖从播放页切回首页的情形）
        window.addEventListener(XUAN_REQUEST_LOGIN_EVENT, trigger);
        return () => window.removeEventListener(XUAN_REQUEST_LOGIN_EVENT, trigger);
    }, []);

    // Online provider collection details
    const [favoriteAlbums, setFavoriteAlbums] = useState<ProviderCollection[]>([]);
    const [loadingAlbums, setLoadingAlbums] = useState(false);
    const [radioItems, setRadioItems] = useState<any[]>([]);
    const [loadingRadio, setLoadingRadio] = useState(false);
    const [devRecommendSongs, setDevRecommendSongs] = useState<SongResult[]>([]);
    const [loadingDevRecommend, setLoadingDevRecommend] = useState(false);
    const [chartSongs, setChartSongs] = useState<Record<string, SongResult[]>>({});
    const [loadingChart, setLoadingChart] = useState(false);
    // 断网回退：当前展示的是本地静态缓存（而非官方实时榜单）。
    const [staticOffline, setStaticOffline] = useState(false);
    const [cacheSongs, setCacheSongs] = useState<SongResult[]>([]);

    const isLoading =
        (homeViewTab === 'playlist' && activeCollections.length === 0 && activeUser !== null) ||
        (homeViewTab === 'albums' && loadingAlbums) ||
        (homeViewTab === 'radio' && loadingRadio) ||
        (homeViewTab === 'devRecommend' && loadingDevRecommend)
        || (isChartTab && loadingChart);

    // 收藏专辑 / 电台：只在切换账号时重新取。
    useEffect(() => {
        if (homeViewTab === 'albums' && favoriteAlbums.length === 0 && activeUser) {
            fetchFavoriteAlbums();
        }
        // 未登录也要能拉取电台内容，避免「电台暂无内容」；切到该 tab 即触发。
        if (homeViewTab === 'radio' && radioItems.length === 0) {
            fetchRadioItems();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeProviderId, activeUser?.id, homeViewTab]);

    // 开发者推荐：只在切到该 tab 时拉一次，避免 loading/长度进依赖导致无限重启。
    useEffect(() => {
        if (homeViewTab !== 'devRecommend') return;
        if (devRecommendSongs.length > 0) return;
        let cancelled = false;
        setLoadingDevRecommend(true);
        setStaticOffline(false);

        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (offline) {
            const cached = readStaticCache('dev', 'main');
            if (cached) {
                setDevRecommendSongs(cached);
                setStaticOffline(true);
            }
            setLoadingDevRecommend(false);
            return () => { cancelled = true; };
        }

        getDeveloperRecommendedSongs()
            .then(songs => {
                if (cancelled) return;
                if (songs.length > 0) {
                    setDevRecommendSongs(songs);
                    writeStaticCache('dev', 'main', songs);
                } else {
                    // 在线返回空（风控/超时）：绝不覆盖缓存，回退静态数据
                    const cached = readStaticCache('dev', 'main');
                    if (cached?.length) { setDevRecommendSongs(cached); setStaticOffline(true); }
                }
            })
            .catch(() => {
                if (cancelled) return;
                const cached = readStaticCache('dev', 'main');
                if (cached) {
                    setDevRecommendSongs(cached);
                    setStaticOffline(true);
                }
            })
            .finally(() => { if (!cancelled) setLoadingDevRecommend(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [homeViewTab, activeProviderId]);

    // 热歌榜 / 古风榜：每次进入都从官方实时拉取，但同一次进入只拉一次。
    // 之前的依赖里带了 loadingChart，请求开始/结束都会重新触发 effect，
    // 形成「请求 → setState → 再请求」的死循环，界面上就是一直闪。
    const chartFetchRef = useRef<string | null>(null);
    useEffect(() => {
        if (!isChartTab) {
            chartFetchRef.current = null;
            return;
        }
        const chartId = homeViewTab as XuanChartId;
        const def = chartDefs[chartId];
        // key 带上 playlistId 与配置版本：管理端改榜单 ID / 顺序后立即重新实时拉取。
        const key = chartId + ':' + (def?.id ?? 0) + ':' + configRev;
        if (chartFetchRef.current === key) return;
        chartFetchRef.current = key;
        let cancelled = false;
        setLoadingChart(true);
        setStaticOffline(false);

        // 断网时直接走本地静态缓存，避免无意义的失败请求与报错刷屏。
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (offline) {
            const cached = readStaticCache('chart', def?.id ?? chartId);
            if (cached) {
                setChartSongs(prev => ({ ...prev, [chartId]: cached }));
                setStaticOffline(true);
            }
            setLoadingChart(false);
            return () => { cancelled = true; };
        }

        getXuanChartSongs(chartId)
            .then(songs => {
                if (cancelled) return;
                if (songs.length > 0) {
                    setChartSongs(prev => ({ ...prev, [chartId]: songs }));
                    // 有网且成功：把实时榜单写入本地静态缓存，供断网回退。
                    writeStaticCache('chart', def?.id ?? chartId, songs);
                } else {
                    // 在线返回空（风控/超时/接口异常）：绝不覆盖缓存，回退静态数据
                    const cached = readStaticCache('chart', def?.id ?? chartId);
                    if (cached?.length) {
                        setChartSongs(prev => ({ ...prev, [chartId]: cached }));
                        setStaticOffline(true);
                    }
                }
            })
            .catch(() => {
                if (cancelled) return;
                // 拉取失败（断网 / 风控 / 超时）：回退到本地静态缓存。
                const cached = readStaticCache('chart', def?.id ?? chartId);
                if (cached) {
                    setChartSongs(prev => ({ ...prev, [chartId]: cached }));
                    setStaticOffline(true);
                }
            })
            .finally(() => { if (!cancelled) setLoadingChart(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [homeViewTab, isChartTab, chartDefs, configRev]);

    // 缓存：读取本地已缓存的歌曲（播放时由缓存层写入）。
    // 播放中写完缓存会派发 xuan:cache-updated，这里实时刷新，
    // 否则用户停在缓存 tab 时刚缓存的歌不会出现。
    useEffect(() => {
        const reload = () => {
            try {
                const raw = localStorage.getItem('xuan_cached_media_songs');
                const parsed = raw ? JSON.parse(raw) : [];
                setCacheSongs(Array.isArray(parsed) ? parsed : []);
            } catch { setCacheSongs([]); }
        };
        if (isCacheTab) reload();
        window.addEventListener('xuan:cache-updated', reload);
        return () => window.removeEventListener('xuan:cache-updated', reload);
    }, [isCacheTab]);

    useEffect(() => {
        setFavoriteAlbums([]);
        setRadioItems([]);
        // [小轩音乐] 播放后返回保持当前板块位置；仅切换板块时归零。
    }, [activeProviderId, activeUser?.id]);

    const fetchFavoriteAlbums = async () => {
        setLoadingAlbums(true);
        try {
            let allAlbums: ProviderCollection[] = [];
            let offset = 0;
            const limit = 50;
            let hasMore = true;

            if (!activeUser) {
                setFavoriteAlbums([]);
                return;
            }
            while (hasMore) {
                const page = await omni.getUserAlbums(activeUser.id, { limit, offset });
                allAlbums = [...allAlbums, ...page.items];
                hasMore = page.hasMore && page.nextOffset > offset;
                offset = page.nextOffset;
            }
            setFavoriteAlbums(allAlbums);
        } catch (e) {
            console.error('[Grid3D] Failed to fetch favorite albums', e);
        } finally {
            setLoadingAlbums(false);
        }
    };

    const fetchFavoriteAlbumsRef = useRef(fetchFavoriteAlbums);
    useEffect(() => {
        fetchFavoriteAlbumsRef.current = fetchFavoriteAlbums;
    });

    useEffect(() => {
        const handleRefreshAlbums = () => {
            void fetchFavoriteAlbumsRef.current();
        };
        window.addEventListener('xuan-refresh-favorite-albums', handleRefreshAlbums);
        return () => window.removeEventListener('xuan-refresh-favorite-albums', handleRefreshAlbums);
    }, []);

    const fetchRadioItems = async () => {
        setLoadingRadio(true);
        try {
            const { personalFm: fmSongs, dailySongs, recommendedCollections } = await omni.getHomeFeed(35);
            const fmCoverUrl = getSongCoverUrl(fmSongs[0], activeProviderId);

            const fmItem = {
                id: 'personal_fm',
                name: '私人FM',
                coverUrl: fmCoverUrl,
                description: 'Personal FM',
                isFm: true,
            };

            const dailyItem = {
                id: 'daily_recommendations',
                name: t('home.dailyRecommendations'),
                coverUrl: getSongCoverUrl(dailySongs[0], activeProviderId) || '',
                trackCount: dailySongs.length,
                description: t('home.dailyRecommendationsDescription'),
                summary: t('home.dailyRecommendationsSummary'),
                isDailyRecommendations: true,
            };

            const recommendedItems = recommendedCollections.map(collection => {
                const description = collection.description || collection.creator?.nickname || '';
                return {
                    ...collection,
                    coverUrl: collection.coverUrl,
                    description,
                    summary: description,
                };
            });
            // 小轩音乐：电台保留私人 FM / 每日推荐 / 官方推荐歌单，
            // 未登录或推荐歌单为空时也不会出现「暂无内容」。
            const items: any[] = [];
            if (activeProviderId === 'netease') items.push(fmItem, dailyItem);
            items.push(...recommendedItems);
            setRadioItems(items);
        } catch (e) {
            console.error('[Grid3D] Failed to fetch radio items', e);
        } finally {
            setLoadingRadio(false);
        }
    };

    // Filter cloud and local playlists
    const playlistCards = useMemo(() => {
        return activeCollections.map(p => ({
            id: p.id,
            name: p.name,
            coverUrl: p.coverUrl,
            trackCount: p.trackCount,
            description: p.creator?.nickname || t('home.playlists'),
            summary: p.description || '',
            type: p.type,
            raw: p
        }));
    }, [activeCollections, t]);

    const albumCards = useMemo(() => {
        return favoriteAlbums.map(a => ({
            id: a.id,
            name: a.name,
            coverUrl: a.coverUrl,
            trackCount: a.trackCount,
            description: getProviderCollectionArtistLabel(a) || t('player.unknownArtist'),
            summary: a.description || '',
            type: 'album' as const,
            raw: a
        }));
    }, [favoriteAlbums, t]);

    const radioCards = useMemo(() => {
        return radioItems.map(r => ({
            id: r.id,
            name: r.name,
            coverUrl: r.coverUrl,
            trackCount: r.trackCount,
            description: r.description || t('home.radio'),
            summary: r.summary || '',
            type: r.isFm
                ? 'radio' as const
                : r.isDailyRecommendations
                    ? 'daily_recommendations' as const
                    : 'playlist' as const,
            raw: r
        }));
    }, [radioItems]);

    const activeSongList = useMemo<SongResult[]>(() => {
        if (isDevRecommendTab) return devRecommendSongs;
        if (isChartTab) return chartSongs[homeViewTab] || [];
        if (isCacheTab) return cacheSongs;
        return [];
    }, [isDevRecommendTab, isChartTab, isCacheTab, homeViewTab, devRecommendSongs, chartSongs, cacheSongs]);

    const devRecommendCards = useMemo(() => activeSongList.map((song) => ({
        id: `xuan_song_${song.id}`,
        name: song.name,
        coverUrl: getSongCoverUrl(song, activeProviderId) || '',
        description: song.artists.map(artist => artist.name).filter(Boolean).join(' / '),
        summary: '',
        type: 'playlist' as const,
        isDevRecommendSong: true,
        vip: isVipSong(song),
        raw: { song, isDevRecommendSong: true },
    })), [activeSongList, activeProviderId]);

    // Active tab list items mapping
    const currentDesktopItems = useMemo(() => {
        if (homeViewTab === 'playlist') return playlistCards;
        if (homeViewTab === 'radio') return radioCards;
        if (isSongListTab || isCacheTab) return devRecommendCards;
        return [];
    }, [homeViewTab, isSongListTab, isCacheTab, playlistCards, radioCards, devRecommendCards]);

    // Delegate GridView opening to the app-level host so Grid3D remains only the home surface.
    // If Personal FM is clicked, it plays Personal FM directly instead of opening GridView.
    const handleSelectCollectionCard = async (card: any) => {
        // 开发者推荐：直接把整份推荐列表作为播放队列交给现有播放链路，
        // 会员 / 付费 / 试听 / 无版权的提示与官方口径由播放层统一处理。
        if (card.isDevRecommendSong || card.raw?.isDevRecommendSong) {
            const song = card.raw?.song as SongResult | undefined;
            // 与搜索完全一致的播放链路：会员 / 付费 / 试听 / 无版权按网易云官方口径提示，
            // 已登录且有会员时官方直接下发完整版。
            if (song) onPlaySong(song, activeSongList, false);
            return;
        }
        if (card.id === 'personal_fm' || card.raw?.id === 'personal_fm') {
            try {
                const fmSongs = await omni.getPersonalFm();
                if (fmSongs.length > 0) {
                    onPlaySong(fmSongs[0], fmSongs, true);
                }
            } catch (e) {
                console.error('[Grid3D] Failed to fetch and play Personal FM:', e);
            }
            return;
        }

        const collection = card.raw
            ? { ...card.raw, type: card.type }
            : card;
        onOpenGridView?.(createOnlineGridViewCollection(collection, activeProviderId));
    };

    const handleFolderImport = async () => {
        if (isLocalImporting || isLocalRefreshing || scanProgress?.active) return;

        setIsLocalImporting(true);
        try {
            const importedSongs = await importFolder();
            if (importedSongs.length > 0) {
                onRefreshLocalSongs();
            }
        } catch (error) {
            console.error('[Grid3D] Failed to import local folder:', error);
            alert(t('localMusic.importNotSupported'));
        } finally {
            setIsLocalImporting(false);
        }
    };

    const handleRefreshFolders = async () => {
        if (isLocalImporting || isLocalRefreshing || scanProgress?.active) return;

        setIsLocalRefreshing(true);
        try {
            const importedSongs = await resyncAllFolders();
            if (importedSongs && importedSongs.length > 0) {
                onRefreshLocalSongs();
            }
        } catch (error) {
            console.error('[Grid3D] Failed to resync local folders:', error);
        } finally {
            setIsLocalRefreshing(false);
        }
    };

    // Search committed callback
    const handleSearch = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const query = searchQuery.trim();
        if (!query) return;
        // 首页搜索同样写入历史，避免只有搜索页提交才记录。
        pushSearchHistory(query);

        const searchSource = isOnlineTab ? activeProviderId : resolveSearchSource(homeViewTab);
        const didSearch = await submitSearch({
            query,
            sourceTab: searchSource,
            deps: {
                localSongs,
                localLibraryCatalog,
                t: (key, fallback) => t(key, fallback ?? ''),
            },
        });

        if (didSearch) {
            onSearchCommitted(query, searchSource);
        }
    };

    const isSearchingActive = isSearching;

    // Background style mappings
    const mainBg = isDaylight ? 'bg-white/40' : 'bg-black/20';
    const inputBg = isDaylight ? 'bg-black/5 focus:bg-black/10' : 'bg-white/5 focus:bg-white/10';
    const navPillBg = isDaylight ? 'bg-black/5' : 'bg-white/10';
    const navPillInactiveText = isDaylight ? 'text-black/60 hover:text-black' : 'text-white/60 hover:text-white';
    const activeTabBg = isDaylight ? 'text-black font-bold' : 'text-black';

    // 横屏空间有限：底部只留刚好容纳悬浮播放器的高度，避免主内容被挤出可视区。
    const bottomPadding = currentTrack ? 'pb-16 md:pb-20' : '';

    const focusActiveSlider = () => {
        requestAnimationFrame(() => {
            gridRootRef.current
                ?.querySelector<HTMLElement>('[data-grid3d-slider]')
                ?.focus({ preventScroll: true });
        });
    };

    return (
        <div ref={gridRootRef} data-xuan-root className={`relative w-full h-full flex flex-col font-sans overflow-hidden ${mainBg} pointer-events-auto backdrop-blur-sm ${bottomPadding}`}>

            {/* 断网回退：当前展示的是本地静态榜单缓存（非官方实时数据）。 */}
            {staticOffline && isSongListTab && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full text-[11px] bg-black/70 text-white/90 backdrop-blur-md pointer-events-none flex items-center gap-1.5 shadow-lg">
                    <WifiOff size={12} />
                    无网络连接 · 已显示离线静态榜单，缓存歌曲可正常播放
                </div>
            )}

            {/* Main Header Container (Fades out when sliding/interacting) */}
            <div className="transition-opacity duration-300 ease-in-out z-20 opacity-100 select-none">
                <div data-xuan-header-grid className="flex items-center gap-3 w-full max-w-7xl mx-auto px-4 py-2 md:px-8">
                    {/* Left title and settings */}
                    <div className="flex shrink-0 items-center justify-start">
                        <h1 className="text-lg md:text-2xl font-bold tracking-tight opacity-90 flex items-center gap-3 whitespace-nowrap">
                            小轩音乐
                        </h1>
                        <button
                            onClick={() => onOpenSettings?.('help')}
                            className={`relative flex items-center gap-1.5 p-2 rounded-full hover:bg-white/10 transition-all ml-4 ${showUpdateIndicator
                                    ? 'opacity-90 hover:opacity-100'
                                    : 'opacity-40 hover:opacity-100'
                                }`}
                            title="Help & Options"
                        >
                            <Settings size={20} style={{ color: 'var(--text-primary)' }} />
                            {showUpdateIndicator && (
                                <span className="text-[10px] font-medium text-zinc-800 dark:text-zinc-200 opacity-80 whitespace-nowrap bg-zinc-200/50 dark:bg-white/10 px-2 py-0.5 rounded-md">
                                    {t('options.updateAvailable')}
                                </span>
                            )}
                        </button>
                        {scanProgress?.active && (
                            <div
                                className="relative ml-3"
                                onMouseEnter={() => setScanDetailsExpanded(true)}
                                onMouseLeave={() => setScanDetailsExpanded(false)}
                            >
                                <button
                                    onClick={() => setScanDetailsExpanded(prev => !prev)}
                                    className="relative rounded-full p-px transition-all"
                                    style={{
                                        background: `conic-gradient(from -90deg, ${isDaylight ? (theme?.accentColor || 'rgba(17,24,39,0.92)') : 'rgba(255,255,255,0.98)'} 0deg ${scanProgressPercent * 3.6}deg, ${isDaylight ? 'rgba(24,24,27,0.16)' : 'rgba(255,255,255,0.14)'} ${scanProgressPercent * 3.6}deg 360deg)`,
                                        borderRadius: '999px'
                                    }}
                                    title={t('options.scanProgress')}
                                >
                                    <div
                                        className={`relative flex items-center justify-center min-w-[56px] h-7 px-2.5 rounded-full backdrop-blur-md ${isDaylight ? 'bg-white/95 text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]' : 'bg-zinc-950/92 text-zinc-100'
                                            }`}
                                    >
                                        <span className="relative z-10 text-[10px] font-semibold tabular-nums leading-none">
                                            {scanProgressPercent}%
                                        </span>
                                    </div>
                                </button>
                                <AnimatePresence>
                                    {scanDetailsExpanded && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -6 }}
                                            className={`absolute left-0 top-full mt-2 w-72 p-4 rounded-2xl border backdrop-blur-xl shadow-xl ${isDaylight ? 'bg-white/85 border-black/10 text-zinc-800' : 'bg-black/60 border-white/10 text-zinc-100'
                                                }`}
                                        >
                                            <div className="text-sm font-semibold truncate">
                                                {t('options.scanningFolder', { folderName: scanProgress.folderName })}
                                            </div>
                                            <div className={`text-xs mt-1 ${isDaylight ? 'text-zinc-600' : 'text-zinc-300/70'}`}>
                                                {t('options.scanProgressDesc')}
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-xs font-mono">
                                                <span>进度</span>
                                                <span>{Math.min(scanProgress.completedSongs, scanProgress.totalSongs)} / {scanProgress.totalSongs}</span>
                                            </div>
                                            <div className={`mt-2 w-full h-2 rounded-full overflow-hidden ${isDaylight ? 'bg-black/10' : 'bg-white/10'}`}>
                                                <div
                                                    className="h-full rounded-full transition-[width] duration-300 ease-out"
                                                    style={{
                                                        width: `${scanProgress.totalSongs > 0 ? (scanProgress.completedSongs / scanProgress.totalSongs) * 100 : 0}%`,
                                                        backgroundColor: theme?.accentColor || 'var(--text-primary)'
                                                    }}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>

                    {/* Center Tab Switcher */}
                    <div className="flex flex-1 min-w-0 justify-center" data-xuan-tabbar>
                        <div className={`relative ${navPillBg} backdrop-blur-md p-1 rounded-full origin-center max-w-full min-w-0 overflow-x-auto xuan-hide-scrollbar`}>
                            <div className="inline-flex items-center gap-0">
                                {[
                                    ...(showHomeTabPlaylist ? [{ key: 'playlist', label: t('home.playlists') }] : []),
                                    ...(showHomeTabRadio ? [{ key: 'radio', label: t('home.radio') }] : []),
                                    ...chartTabs,
                                    ...(showHomeTabDevRecommend ? [{ key: 'devRecommend', label: '开发者推荐' }] : []),
                                    ...(showHomeTabCache ? [{ key: 'cache', label: '缓存' }] : []),
                                    ...(showHomeTabLocal && localMusicAvailable ? [{ key: 'local', label: t('localMusic.folder') }] : []),
                                    ...(navidromeEnabled ? [{ key: 'navidrome', label: t('navidrome.title') || 'Navidrome' }] : []),
                                ].map((tab) => {
                                    const isActive = homeViewTab === tab.key;
                                    return (
                                        <button
                                            key={tab.key}
                                            onClick={() => {
                                                setHomeViewTab(tab.key as any);
                                                focusActiveSlider();
                                            }}
                                            className={`relative inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs md:text-sm font-medium transition-colors duration-300 whitespace-nowrap ${isActive ? activeTabBg : navPillInactiveText}`}
                                        >
                                            {isActive && (
                                                <motion.span
                                                    layoutId="home-active-tab-pill-desktop"
                                                    className="absolute inset-0 rounded-full bg-white shadow-sm"
                                                    transition={{ type: 'spring', stiffness: 460, damping: 36, mass: 0.9 }}
                                                />
                                            )}
                                            <span className="relative z-10">{tab.label}</span>
                                        </button>
                                    );
                                })}
                                {stageEnabled && (
                                    <button
                                        onClick={() => onOpenStagePlayer?.()}
                                        data-stage-active={stageIsActive ? 'true' : 'false'}
                                        className={`relative inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs md:text-sm font-medium transition-colors duration-300 whitespace-nowrap ${navPillInactiveText}`}
                                    >
                                        <span className="relative z-10">{t('home.stage')}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Search Bar */}
                    <div className="flex shrink-0 justify-end">
                        <form onSubmit={handleSearch} className="relative w-32 sm:w-40 md:w-56 transition-all focus-within:md:w-72">
                            {isSearchingActive ? (
                                <Loader2 className="absolute left-3 top-1/2 w-4 h-4 animate-spin opacity-40 -mt-2" />
                            ) : (
                                <Search
                                    className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40 w-4 h-4 cursor-pointer hover:opacity-100 transition-opacity"
                                    onClick={() => handleSearch()}
                                />
                            )}
                            <input
                                type="text"
                                placeholder={homeViewTab === 'local' && localMusicAvailable ? t('home.searchLocal') : homeViewTab === 'navidrome' ? t('home.searchNavidrome') : t('home.searchDatabase')}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className={`w-full ${inputBg} border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-white/20 transition-all placeholder:text-current placeholder:opacity-40 select-text`}
                                style={{ color: 'var(--text-primary)' }}
                            />
                        </form>
                    </div>
                </div>
            </div>

            {/* Desktop Canvas Surface */}
            <div data-xuan-canvas className="flex-1 min-h-0 flex flex-col items-center justify-center relative">
                {isOnlineTab && !isDevRecommendTab && activeAccountView === 'resolving' ? (
                    <div className="flex flex-1 w-full items-center justify-center" aria-busy="true">
                        <Loader2 className="animate-spin opacity-30" size={28} />
                    </div>
                ) : isOnlineTab && !isSongListTab && !isCacheTab && activeAccountView === 'guest' ? (
                    <OnlineProviderConnectPanel
                        providers={onlineProviderPlatform?.providers || omni.getProviderSummaries()}
                        activeProviderId={activeProviderId}
                        isDaylight={isDaylight}
                        title={activeProviderNeedsRelogin ? t('status.loginExpired') : t('home.guestTitle')}
                        prompt={activeProviderNeedsRelogin
                            ? t('home.guestPromptProvider', {
                                provider: activeProviderSummary?.shortName || activeProviderSummary?.displayName || activeProviderId,
                            })
                            : t('home.guestPrompt')}
                        getActionLabel={provider => provider.status === 'authenticated'
                            ? t('home.switchToProvider', { provider: provider.shortName || provider.displayName })
                            : t('home.connectProviderAccount', { provider: provider.shortName || provider.displayName })}
                        onSelect={provider => {
                            if (provider.status === 'authenticated') {
                                void onlineProviderPlatform?.switchProvider(provider.providerId);
                            } else {
                                void initLogin(provider.providerId);
                            }
                        }}
                    />
                ) : isOnlineTab ? (
                    <DesktopGrid3DSurface
                        title={
                            isDevRecommendTab
                                ? '开发者推荐'
                                : isChartTab
                                    ? (chartDefs[homeViewTab]?.name || '榜单')
                                    : isCacheTab
                                        ? '缓存'
                                        : homeViewTab === 'playlist'
                                            ? t('home.playlists')
                                            : t('home.radio')
                        }
                        mapButtonLabel={t('home.allAlbums')}
                        items={currentDesktopItems}
                        focusedIndex={focusedIndex}
                        onFocusedIndexChange={setFocusedIndex}
                        onSelect={handleSelectCollectionCard}
                        isLoading={isLoading}
                        emptyMessage={isSongListTab
                            ? (isDevRecommendTab ? '正在获取推荐歌曲…' : '正在从网易云官方获取榜单…')
                            : isCacheTab ? '暂无缓存音乐，播放过的歌曲会自动缓存' : t('home.loadingLibrary')}
                        theme={theme}
                        isDaylight={isDaylight}
                        isInteractive={isInteractive}
                        hasFloatingPlayer={Boolean(currentTrack)}
                        playlistVisibilityScope={`online:${activeProviderId}`}
                    />
                ) : homeViewTab === 'local' && localMusicAvailable ? (
                    <div className="w-full h-full flex-1">
                        <LocalGrid3DView
                            localSongs={localSongs}
                            localPlaylists={localPlaylists}
                            activeRow={localMusicState.activeRow}
                            setActiveRow={(row) => setLocalMusicState(prev => ({ ...prev, activeRow: row }))}
                            focusedFolderIndex={localMusicState.focusedFolderIndex}
                            setFocusedFolderIndex={(index) => setLocalMusicState(prev => ({ ...prev, focusedFolderIndex: index }))}
                            focusedAlbumIndex={localMusicState.focusedAlbumIndex}
                            setFocusedAlbumIndex={(index) => setLocalMusicState(prev => ({ ...prev, focusedAlbumIndex: index }))}
                            focusedArtistIndex={localMusicState.focusedArtistIndex}
                            setFocusedArtistIndex={(index) => setLocalMusicState(prev => ({ ...prev, focusedArtistIndex: index }))}
                            focusedPlaylistIndex={localMusicState.focusedPlaylistIndex}
                            setFocusedPlaylistIndex={(index) => setLocalMusicState(prev => ({ ...prev, focusedPlaylistIndex: index }))}
                            onImportFolder={handleFolderImport}
                            onRefreshFolders={handleRefreshFolders}
                            importButtonDisabled={isLocalImporting || isLocalRefreshing || Boolean(scanProgress?.active)}
                            isImporting={isLocalImporting}
                            isRefreshing={isLocalRefreshing}
                            isScanInProgress={Boolean(scanProgress?.active)}
                            theme={theme}
                            isDaylight={isDaylight}
                            isInteractive={isInteractive}
                            hasFloatingPlayer={Boolean(currentTrack)}
                            onOpenGridView={onOpenGridView}
                        />
                    </div>
                ) : (
                    <div className="w-full h-full flex-1">
                        <NavidromeGrid3DView
                            theme={theme}
                            isDaylight={isDaylight}
                            isInteractive={isInteractive}
                            focusedAlbumIndex={navidromeFocusedAlbumIndex}
                            setFocusedAlbumIndex={setNavidromeFocusedAlbumIndex ?? (() => { })}
                            externalSelection={pendingNavidromeSelection}
                            hasFloatingPlayer={Boolean(currentTrack)}
                            onExternalSelectionHandled={onPendingNavidromeSelectionHandled}
                            onOpenSettings={() => onOpenSettings?.('help')}
                            onOpenGridView={onOpenGridView}
                        />
                    </div>
                )}
            </div>

            {/* Login Modal */}
            <AnimatePresence>
                {showLoginModal && (
                    <OnlineProviderLoginModal
                        title={t(loginProviderId === 'kugou' ? 'home.loginTitleKugou' : 'home.loginTitle')}
                        note={t(loginProviderId === 'kugou' ? 'home.loginNoteKugou' : 'home.loginNote')}
                        qrCodeImg={qrCodeImg}
                        statusText={qrStatusText}
                        state={qrState}
                        retryLabel={t('home.retryQr')}
                        closeLabel={t('home.closeLogin')}
                        onRetry={() => void startQrLogin(loginProviderId)}
                        onClose={() => {
                            setShowLoginModal(false);
                            stopQrLogin();
                        }}
                    />
                )}
            </AnimatePresence>

            {onlineProviderPlatform && (
                <OnlineProviderSwitcher
                    providers={onlineProviderPlatform.providers}
                    activeProviderId={activeProviderId}
                    isDaylight={isDaylight}
                    onBackToPlayer={onBackToPlayer}
                    onSelect={provider => {
                        if (provider.status === 'authenticated') {
                            void onlineProviderPlatform.switchProvider(provider.providerId);
                        } else {
                            void initLogin(provider.providerId);
                        }
                    }}
                    onLogout={provider => {
                        void onlineProviderPlatform.logoutProvider(provider.providerId);
                    }}
                />
            )}

        </div>
    );
};

export default Grid3D;
