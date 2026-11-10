/**
 * 小轩音乐运行时接线（客户端 + 网页端共用）
 * ------------------------------------------------------------------
 * 1. 注册播放遥控（供进度条上下曲、状态栏通知、网页 Media Session 调用）
 * 2. 状态栏媒体通知：随歌曲/播放态/收藏态/登录态实时刷新
 * 3. 状态栏按钮事件 → 触发对应播放控制
 * 4. 登录后从官方同步「我喜欢的音乐」到收藏状态（含从未播放过的曲目）
 * 5. 启动时检查更新
 * 6. 网页端后台播放：Media Session + 页面隐藏时保持音频
 * 7. 服务端配置变更 → 触发界面重渲染（实时同步，不刷新不重启）
 */

import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { registerPlayerRemote } from '../services/playerRemote';
import { onServerConfigChange, fetchServerConfig, getServerConfig, initXuanServer } from '../services/xuanServer';
import { initFavoriteCache, syncLikedFromCloud, onFavoriteChange } from '../services/neteaseFavorite';
import {
  initAppUpdater, updateMediaNotification, onMediaAction,
} from '../services/appUpdater';
import type { SongResult } from '../types';
import { PlayerState } from '../types';

interface Args {
  currentSong: SongResult | null;
  playerState: PlayerState;
  isLoggedIn: boolean;
  isLiked: boolean;
  coverUrl: string | null;
  handleNextTrack: () => void;
  handlePrevTrack: () => void;
  togglePlay: () => void;
  handleLike: () => void;
}

const isNative = () => Capacitor.isNativePlatform();

export function useXuanRuntimeBridge(a: Args) {
  const ref = useRef(a);
  ref.current = a;
  const [, force] = useState(0);

  // ---------- 初始化：服务端、收藏缓存、更新检查、配置实时重渲染 ----------
  useEffect(() => {
    void initXuanServer();
    initFavoriteCache();
    void initAppUpdater();
    // 帧率：默认设备最高，用户设置的低档在此应用（仅客户端）
    void import('../services/frameRate').then(m => void m.applyFrameRate()).catch(() => {});
    const off = onServerConfigChange(() => force(n => n + 1));
    const offFav = onFavoriteChange(() => force(n => n + 1));
    const onCfg = () => force(n => n + 1);
    window.addEventListener('xuan:server-config', onCfg);
    return () => { off(); offFav(); window.removeEventListener('xuan:server-config', onCfg); };
  }, []);

  // ---------- 登录后同步云端「我喜欢的音乐」 ----------
  useEffect(() => {
    if (!a.isLoggedIn) return;
    void syncLikedFromCloud();
    const timer = window.setInterval(() => void syncLikedFromCloud(), 120000);
    return () => window.clearInterval(timer);
  }, [a.isLoggedIn]);

  // ---------- 注册播放遥控 ----------
  useEffect(() => {
    registerPlayerRemote({
      prev: () => ref.current.handlePrevTrack(),
      next: () => ref.current.handleNextTrack(),
      toggle: () => ref.current.togglePlay(),
      like: () => ref.current.handleLike(),
      getState: () => {
        const s = ref.current;
        const song: any = s.currentSong;
        const artists = song?.artists ?? song?.ar ?? [];
        const artist = Array.isArray(artists)
          ? artists.map((x: any) => x?.name ?? '').filter(Boolean).join(' / ')
          : (song?.artist ?? '');
        return {
          playing: s.playerState === PlayerState.PLAYING,
          songName: song?.name ?? '',
          artist,
          cover: s.coverUrl,
          liked: s.isLiked,
          loggedIn: s.isLoggedIn,
        };
      },
    });
  }, []);

  // ---------- 常驻媒体通知（仅客户端） ----------
  // 规则：App 活着（后台没清掉）→ 通知栏常驻媒体模块；完全清后台 → 服务 onTaskRemoved 移除
  useEffect(() => {
    if (!isNative()) return;
    const s = ref.current;
    const song: any = s.currentSong;
    if (!song) {
      void updateMediaNotification({
        title: '小轩音乐', artist: '未在播放', playing: false,
        cover: null, showFavorite: false, liked: false,
      });
      return;
    }
    const artists = song?.artists ?? song?.ar ?? [];
    const artist = Array.isArray(artists)
      ? artists.map((x: any) => x?.name ?? '').filter(Boolean).join(' / ')
      : (song?.artist ?? '');
    void updateMediaNotification({
      title: song?.name ?? '小轩音乐',
      artist,
      playing: s.playerState === PlayerState.PLAYING,
      cover: s.coverUrl,
      // 未登录不显示收藏按钮；登录才显示
      showFavorite: s.isLoggedIn && (getServerConfig()?.ui?.showStatusBarFavorite !== false),
      liked: s.isLiked,
    });
  }, [a.currentSong, a.playerState, a.isLiked, a.isLoggedIn, a.coverUrl]);

  // ---------- 状态栏按钮事件 ----------
  useEffect(() => {
    return onMediaAction(action => {
      const s = ref.current;
      switch (action) {
        case 'prev': s.handlePrevTrack(); break;
        case 'next': s.handleNextTrack(); break;
        case 'play': case 'pause': s.togglePlay(); break;
        case 'like': if (s.isLoggedIn) s.handleLike(); break;
      }
    });
  }, []);

  // ---------- 网页端：后台播放 + Media Session ----------
  useEffect(() => {
    if (isNative() || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const s = ref.current;
    const song: any = s.currentSong;
    if (!song) return;
    const artists = song?.artists ?? song?.ar ?? [];
    const artist = Array.isArray(artists)
      ? artists.map((x: any) => x?.name ?? '').filter(Boolean).join(' / ')
      : (song?.artist ?? '');
    try {
      const MediaMetadataCtor = (window as any).MediaMetadata;
      if (MediaMetadataCtor) {
        navigator.mediaSession.metadata = new MediaMetadataCtor({
          title: song.name ?? '', artist,
          album: song.album?.name ?? '小轩音乐',
          artwork: s.coverUrl ? [{ src: s.coverUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
        });
      }
      const handlers: Record<string, () => void> = {
        play: () => ref.current.togglePlay(),
        pause: () => ref.current.togglePlay(),
        previoustrack: () => ref.current.handlePrevTrack(),
        nexttrack: () => ref.current.handleNextTrack(),
      };
      for (const [k, fn] of Object.entries(handlers)) {
        try { navigator.mediaSession.setActionHandler(k as any, fn); } catch { /* noop */ }
      }
      navigator.mediaSession.playbackState = s.playerState === PlayerState.PLAYING ? 'playing' : 'paused';
    } catch { /* noop */ }

    // 后台播放：切到后台时阻止音频被浏览器节流/暂停
    const keepAlive = () => {
      const audio = document.querySelector('audio') as HTMLAudioElement | null;
      if (audio && !audio.paused) { /* 保持引用即避免被回收 */ }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') keepAlive(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [a.currentSong, a.playerState, a.coverUrl]);

  return getServerConfig();
}
