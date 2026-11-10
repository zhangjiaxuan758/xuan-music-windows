import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import type { MotionValue } from 'framer-motion';
import { omni } from '../services/onlineMusic/omni';
import { PlayerState } from '../types';
import type { ReplayGainMode, SongResult, StageLoopMode, StatusMessage } from '../types';
import { getReplayGainModeLabel } from '../utils/appPlaybackHelpers';

// src/hooks/usePlaybackInteractionBridge.ts

const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac');

type PlayerEscapeAction = 'ignore' | 'allow-fullscreen-exit' | 'close-panel' | 'navigate-back';

export const resolvePlayerEscapeAction = ({
    currentView,
    hasBlockingWindow,
    isFullscreen,
    isPanelOpen,
    isRepeat,
}: {
    currentView: string;
    hasBlockingWindow: boolean;
    isFullscreen: boolean;
    isPanelOpen: boolean;
    isRepeat: boolean;
}): PlayerEscapeAction => {
    if (currentView !== 'player' || hasBlockingWindow || isRepeat) return 'ignore';
    if (isFullscreen) return 'allow-fullscreen-exit';
    return isPanelOpen ? 'close-panel' : 'navigate-back';
};

type UsePlaybackInteractionBridgeParams = {
    isDev: boolean;
    currentSong: SongResult | null;
    currentView: string;
    audioSrc: string | null;
    activePlaybackContext: 'main' | 'stage';
    stageActiveEntryKind: string | null;
    isNowPlayingStageActive: boolean;
    isPanelOpen: boolean;
    isFmMode: boolean;
    playerState: PlayerState;
    duration: number;
    currentTime: MotionValue<number>;
    audioRef: React.RefObject<HTMLAudioElement | null>;
    stageLyricsClockRef: React.MutableRefObject<{
        startTimeSec: number;
        endTimeSec: number;
        baseTimeSec: number;
        startedAtMs: number | null;
    }>;
    setIsDevDebugOverlayVisible: React.Dispatch<React.SetStateAction<boolean>>;
    cyclePlayerChromeVisibilityMode: () => void;
    setIsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setReplayGainMode: React.Dispatch<React.SetStateAction<ReplayGainMode>>;
    setStatusMsg: React.Dispatch<React.SetStateAction<StatusMessage | null>>;
    handleNextTrack: () => Promise<void> | void;
    handlePrevTrack: () => void;
    handleToggleLoopMode: () => void;
    navigateBackFromPlayer: () => void;
    pausePlayback: () => void;
    resumePlayback: () => Promise<void>;
    syncStageLyricsClock: (timeSec: number, endTimeSec: number, nextPlayerState: PlayerState, startTimeSec?: number) => void;
    togglePlayerChromeHidden: () => void;
};

// Bridges playback-related keyboard and click interactions without leaving them inline in App.tsx.
export function usePlaybackInteractionBridge({
    isDev,
    currentSong,
    currentView,
    audioSrc,
    activePlaybackContext,
    stageActiveEntryKind,
    isNowPlayingStageActive,
    isPanelOpen,
    isFmMode,
    playerState,
    duration,
    currentTime,
    audioRef,
    stageLyricsClockRef,
    setIsDevDebugOverlayVisible,
    cyclePlayerChromeVisibilityMode,
    setIsPanelOpen,
    setReplayGainMode,
    setStatusMsg,
    handleNextTrack,
    handlePrevTrack,
    handleToggleLoopMode,
    navigateBackFromPlayer,
    pausePlayback,
    resumePlayback,
    syncStageLyricsClock,
    togglePlayerChromeHidden,
}: UsePlaybackInteractionBridgeParams) {
    const togglePlay = useCallback((event?: React.MouseEvent | KeyboardEvent) => {
        event?.stopPropagation();

        if (isNowPlayingStageActive) {
            return;
        }

        if (activePlaybackContext === 'stage' && stageActiveEntryKind === 'lyrics' && !audioSrc) {
            if (playerState === PlayerState.PLAYING) {
                pausePlayback();
            } else {
                void resumePlayback();
            }
            return;
        }

        if (audioRef.current) {
            if (!audioRef.current.paused && !audioRef.current.ended) {
                pausePlayback();
            } else {
                void resumePlayback();
            }
        }
    }, [activePlaybackContext, audioRef, audioSrc, isNowPlayingStageActive, pausePlayback, playerState, resumePlayback, stageActiveEntryKind]);

    const toggleLoop = useCallback((event?: React.MouseEvent) => {
        event?.stopPropagation();
        if (isNowPlayingStageActive) {
            return;
        }

        handleToggleLoopMode();
    }, [handleToggleLoopMode, isNowPlayingStageActive]);

    const handleChangeReplayGainMode = useCallback((mode: ReplayGainMode) => {
        setReplayGainMode(mode);
        setStatusMsg({ type: 'info', text: getReplayGainModeLabel(mode) });
    }, [setReplayGainMode, setStatusMsg]);

    // 小轩音乐：播放页双击两下进入 / 退出沉浸模式。
    // 用 320ms 内的两次 click 判定双击，Android 触屏与桌面鼠标都适用。
    const lastTapRef = useRef(0);
    // 切换沉浸后短暂冷却，避免退出沉浸那次点击残留成下一拍双击，
    // 吞掉按钮第一次点击或又误切回沉浸。
    const suppressTapUntilRef = useRef(0);
    const handleContainerClick = useCallback((event?: React.MouseEvent) => {
        // 只有点在播放页「空白背景」上才参与双击沉浸判定。
        // 进度条、按钮、滑杆、输入框等交互元素一律放行，单击立即响应，
        // 避免双击检测吞掉点击导致「要点好几次 / 等好久」。
        const target = event?.target as HTMLElement | undefined;
        if (target?.closest('button, a, input, textarea, select, [role="slider"], [role="button"], [data-xuan-control], [data-xuan-no-double]')) {
            return;
        }
        if (isPanelOpen) {
            setIsPanelOpen(false);
        }
        if (currentView !== 'player') return;
        const now = Date.now();
        if (now < suppressTapUntilRef.current) return;
        if (now - lastTapRef.current < 300) {
            lastTapRef.current = 0;
            suppressTapUntilRef.current = now + 400;
            togglePlayerChromeHidden();
        } else {
            lastTapRef.current = now;
        }
    }, [currentView, isPanelOpen, setIsPanelOpen, togglePlayerChromeHidden]);

    const handleFmTrash = useCallback(async () => {
        if (isNowPlayingStageActive) {
            return;
        }

        if (currentSong && isFmMode) {
            try {
                await omni.dislikeSong(currentSong);
            } catch (error) {
                void error;
            }
            void handleNextTrack();
        }
    }, [currentSong, handleNextTrack, isFmMode, isNowPlayingStageActive]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                event.target instanceof HTMLInputElement
                || event.target instanceof HTMLTextAreaElement
                || (event.target instanceof HTMLElement && event.target.isContentEditable)
            ) {
                return;
            }

            const hasBlockingWindow = () => Boolean(
                document.querySelector('[data-folia-keyboard-window="true"]')
            );

            if (isDev && event.altKey && event.shiftKey && event.code === 'KeyD') {
                event.preventDefault();
                setIsDevDebugOverlayVisible(prev => !prev);
                return;
            }

            switch (event.code) {
                case 'Escape': {
                    const action = resolvePlayerEscapeAction({
                        currentView,
                        hasBlockingWindow: hasBlockingWindow(),
                        isFullscreen: Boolean(document.fullscreenElement),
                        isPanelOpen,
                        isRepeat: event.repeat,
                    });
                    if (action === 'ignore' || action === 'allow-fullscreen-exit') return;
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    if (action === 'close-panel') {
                        setIsPanelOpen(false);
                        return;
                    }
                    navigateBackFromPlayer();
                    break;
                }
                case 'Space':
                    if (currentSong && (audioSrc || isNowPlayingStageActive || (activePlaybackContext === 'stage' && stageActiveEntryKind === 'lyrics'))) {
                        event.preventDefault();
                        if (isNowPlayingStageActive) {
                            return;
                        }
                        togglePlay(event);
                    }
                    break;
                case 'ArrowLeft':
                    const isPrevTrackKey = isMac 
                        ? (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey)
                        : (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey);

                    if (isPrevTrackKey) {
                        if (currentSong) {
                            event.preventDefault();
                            if (isNowPlayingStageActive) {
                                return;
                            }
                            handlePrevTrack();
                        }
                        return;
                    }

                    if (currentView !== 'player') return;
                    event.preventDefault();
                    if (isNowPlayingStageActive) {
                        return;
                    }

                    if (activePlaybackContext === 'stage' && stageActiveEntryKind === 'lyrics' && !audioSrc) {
                        const nextTime = Math.max(stageLyricsClockRef.current.startTimeSec, currentTime.get() - 5);
                        syncStageLyricsClock(nextTime, duration, playerState, stageLyricsClockRef.current.startTimeSec);
                        currentTime.set(nextTime);
                    } else if (audioRef.current) {
                        const nextTime = Math.max(0, audioRef.current.currentTime - 5);
                        audioRef.current.currentTime = nextTime;
                    }
                    break;
                case 'ArrowRight':
                    const isNextTrackKey = isMac 
                        ? (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey)
                        : (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey);

                    if (isNextTrackKey) {
                        if (currentSong) {
                            event.preventDefault();
                            if (isNowPlayingStageActive) {
                                return;
                            }
                            void handleNextTrack();
                        }
                        return;
                    }

                    if (currentView !== 'player') return;
                    event.preventDefault();
                    if (isNowPlayingStageActive) {
                        return;
                    }

                    if (activePlaybackContext === 'stage' && stageActiveEntryKind === 'lyrics' && !audioSrc) {
                        const nextTime = Math.min(duration, currentTime.get() + 5);
                        syncStageLyricsClock(nextTime, duration, playerState, stageLyricsClockRef.current.startTimeSec);
                        currentTime.set(nextTime);
                    } else if (audioRef.current) {
                        const nextTime = Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + 5);
                        audioRef.current.currentTime = nextTime;
                    }
                    break;
                case 'KeyH':
                    if (currentView !== 'player' || isPanelOpen || hasBlockingWindow()) return;
                    if (event.ctrlKey || event.altKey || event.metaKey) return;
                    event.preventDefault();
                    cyclePlayerChromeVisibilityMode();
                    break;
                case 'KeyP':
                    if (currentView !== 'player' || hasBlockingWindow()) return;
                    if (event.ctrlKey || event.altKey || event.metaKey) return;
                    event.preventDefault();
                    setIsPanelOpen(prev => !prev);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        activePlaybackContext,
        audioRef,
        audioSrc,
        currentSong,
        currentTime,
        currentView,
        duration,
        handleNextTrack,
        handlePrevTrack,
        isDev,
        isNowPlayingStageActive,
        isPanelOpen,
        navigateBackFromPlayer,
        pausePlayback,
        playerState,
        resumePlayback,
        setIsDevDebugOverlayVisible,
        setIsPanelOpen,
        cyclePlayerChromeVisibilityMode,
        stageActiveEntryKind,
        stageLyricsClockRef,
        syncStageLyricsClock,
        togglePlay,
    ]);

    return {
        togglePlay,
        toggleLoop,
        handleChangeReplayGainMode,
        handleContainerClick,
        handleFmTrash,
    };
}
