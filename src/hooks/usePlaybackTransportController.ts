import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { PlayerState } from '../types';

// src/hooks/usePlaybackTransportController.ts

type UsePlaybackTransportControllerParams = {
    activePlaybackContext: 'main' | 'stage';
    stageActiveEntryKind: string | null;
    isNowPlayingStageActive: boolean;
    audioSrc: string | null;
    duration: number;
    audioRef: RefObject<HTMLAudioElement | null>;
    audioContextRef: MutableRefObject<AudioContext | null>;
    currentTime: { set: (value: number) => void };
    stageLyricsClockRef: MutableRefObject<{
        startTimeSec: number;
        endTimeSec: number;
        baseTimeSec: number;
        startedAtMs: number | null;
    }>;
    setPlayerState: Dispatch<SetStateAction<PlayerState>>;
    setStatusMsg: Dispatch<SetStateAction<any>>;
    setupAudioAnalyzer: () => void;
    syncOutputGain: (targetVolume: number, smoothing?: number) => void;
    getTargetPlaybackVolume: () => number;
    shouldRefreshCurrentOnlineAudioSource: () => boolean;
    recoverOnlinePlaybackSource: (options: {
        failedSrc?: string | null;
        resumeAt?: number;
        autoplay: boolean;
    }) => Promise<boolean>;
    getSyntheticStageLyricsTime: () => number;
    syncStageLyricsClock: (timeSec: number, endTimeSec: number, nextPlayerState: PlayerState, startTimeSec?: number) => void;
    t: (key: string) => string;
};

// Owns play and pause transport behavior across main playback and Stage lyric-only playback.
export function usePlaybackTransportController({
    activePlaybackContext,
    stageActiveEntryKind,
    isNowPlayingStageActive,
    audioSrc,
    duration,
    audioRef,
    audioContextRef,
    currentTime,
    stageLyricsClockRef,
    setPlayerState,
    setStatusMsg,
    setupAudioAnalyzer,
    syncOutputGain,
    getTargetPlaybackVolume,
    shouldRefreshCurrentOnlineAudioSource,
    recoverOnlinePlaybackSource,
    getSyntheticStageLyricsTime,
    syncStageLyricsClock,
    t,
}: UsePlaybackTransportControllerParams) {
    const resumePlayback = useCallback(async () => {
        if (isNowPlayingStageActive) {
            return;
        }

        if (activePlaybackContext === 'stage' && stageActiveEntryKind === 'lyrics' && !audioSrc) {
            const currentSyntheticTime = getSyntheticStageLyricsTime();
            syncStageLyricsClock(currentSyntheticTime, duration, PlayerState.PLAYING, stageLyricsClockRef.current.startTimeSec);
            currentTime.set(currentSyntheticTime);
            setPlayerState(PlayerState.PLAYING);
            return;
        }

        if (!audioRef.current) {
            return;
        }

        setupAudioAnalyzer();
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }

        // 淡入起点：先静音，play() 成功后再渐变到目标音量。
        syncOutputGain(0, 0);
        const audio = audioRef.current as (HTMLAudioElement & { __xuanFadeTimer?: number; __xuanPausing?: boolean }) | null;
        if (audio) {
            audio.__xuanPausing = false;
            if (typeof audio.__xuanFadeTimer === 'number') {
                window.clearTimeout(audio.__xuanFadeTimer);
                audio.__xuanFadeTimer = undefined;
            }
        }
        if (shouldRefreshCurrentOnlineAudioSource()) {
            const refreshed = await recoverOnlinePlaybackSource({
                failedSrc: audioRef.current.currentSrc || audioSrc,
                resumeAt: audioRef.current.currentTime,
                autoplay: true,
            });

            if (refreshed) {
                return;
            }
        }

        try {
            await audioRef.current.play();
            syncOutputGain(getTargetPlaybackVolume(), 0.12);
            setPlayerState(PlayerState.PLAYING);
        } catch (error) {
            const recovered = await recoverOnlinePlaybackSource({
                failedSrc: audioRef.current.currentSrc || audioSrc,
                resumeAt: audioRef.current.currentTime,
                autoplay: true,
            });

            if (recovered) {
                return;
            }

            if (!audioRef.current.paused && !audioRef.current.ended) {
                syncOutputGain(getTargetPlaybackVolume(), 0.12);
                setPlayerState(PlayerState.PLAYING);
                return;
            }

            if (error instanceof DOMException && error.name === 'NotAllowedError') {
                setStatusMsg({ type: 'info', text: t('status.clickToPlay') });
                setPlayerState(PlayerState.PAUSED);
                return;
            }

            setStatusMsg({ type: 'error', text: t('status.playbackError') });
            setPlayerState(PlayerState.PAUSED);
            throw error;
        }
    }, [activePlaybackContext, audioContextRef, audioRef, audioSrc, currentTime, duration, getSyntheticStageLyricsTime, getTargetPlaybackVolume, isNowPlayingStageActive, recoverOnlinePlaybackSource, setPlayerState, setStatusMsg, setupAudioAnalyzer, shouldRefreshCurrentOnlineAudioSource, stageActiveEntryKind, stageLyricsClockRef, syncOutputGain, syncStageLyricsClock, t]);

    const pausePlayback = useCallback(() => {
        if (isNowPlayingStageActive) {
            return;
        }

        if (activePlaybackContext === 'stage' && stageActiveEntryKind === 'lyrics' && !audioSrc) {
            const currentSyntheticTime = getSyntheticStageLyricsTime();
            syncStageLyricsClock(currentSyntheticTime, duration, PlayerState.PAUSED, stageLyricsClockRef.current.startTimeSec);
            currentTime.set(currentSyntheticTime);
            setPlayerState(PlayerState.PAUSED);
            return;
        }

        if (!audioRef.current) {
            return;
        }

        // 淡出：先把音量渐变到 0，约 260ms 后再真正暂停，避免「咔」的突变。
        const audio = audioRef.current as HTMLAudioElement & { __xuanFadeTimer?: number; __xuanPausing?: boolean };
        // 标记「淡出中」：App 的 onPlay/onPlaying 会据此跳过 setPlayerState(PLAYING)，
        // 图标一次到位，不再「暂停→闪一下播放→又回暂停」。
        audio.__xuanPausing = true;
        syncOutputGain(0, 0.08);
        if (typeof audio.__xuanFadeTimer === 'number') {
            window.clearTimeout(audio.__xuanFadeTimer);
        }
        audio.__xuanFadeTimer = window.setTimeout(() => {
            audio.__xuanFadeTimer = undefined;
            if (!audio.paused) {
                audio.pause();
            }
            audio.__xuanPausing = false;
            // 保持静音直到下一次 resume 淡入；若在 pause 后瞬时把增益拉回目标值，
            // 解码器残留缓冲会「咔」一声，这就是暂停瞬间杂音的来源。
        }, 240);
        setPlayerState(PlayerState.PAUSED);
    }, [activePlaybackContext, audioRef, audioSrc, currentTime, duration, getSyntheticStageLyricsTime, getTargetPlaybackVolume, isNowPlayingStageActive, setPlayerState, stageActiveEntryKind, stageLyricsClockRef, syncOutputGain, syncStageLyricsClock]);

    return {
        resumePlayback,
        pausePlayback,
    };
}
