import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Repeat, Repeat1, RepeatOff, ChartBar, SkipBack, SkipForward } from 'lucide-react';
import { MotionValue } from 'framer-motion';
import ProgressBar from './ProgressBar';
import { PlayerState, LyricData, Theme } from '../types';
import LyricsTimelineModal from './modal/LyricsTimelineModal';
import { playerRemote } from '../services/playerRemote';
import { Capacitor } from '@capacitor/core';
import { getServerConfig } from '../services/xuanServer';

const CONTROL_LAYOUT_SPRING = {
    type: 'spring' as const,
    stiffness: 280,
    damping: 24,
};

const HOVER_EXPAND_DELAY_MS = 20;
const HOVER_COLLAPSE_DELAY_MS = 100;
const HOVER_HITBOX_BOTTOM_BUFFER_PX = 32;

interface FloatingPlayerControlsProps {
    currentSong: { name: string; } | null;
    playerState: PlayerState;
    currentTime: MotionValue<number>;
    lyricCurrentTime?: MotionValue<number>;
    duration: number;
    loopMode: 'off' | 'all' | 'one';
    currentView: 'home' | 'player';
    audioSrc: string | null;
    canTogglePlay?: boolean;
    lyrics: LyricData | null;
    onSeek: (time: number) => void;
    onTogglePlay: () => void;
    onToggleLoop: () => void;
    onNavigateToPlayer: () => void;
    noTrackText?: string;
    primaryColor?: string;
    secondaryColor?: string;
    theme?: Theme;
    isDaylight: boolean;
    isHidden?: boolean;
    hideControlBar?: boolean;
    controlsDisabled?: boolean;
}


const FloatingPlayerControls: React.FC<FloatingPlayerControlsProps> = ({
    currentSong,
    playerState,
    currentTime,
    lyricCurrentTime,
    duration,
    loopMode,
    currentView,
    canTogglePlay = false,
    lyrics,
    onSeek,
    onTogglePlay,
    onToggleLoop,
    onNavigateToPlayer,
    noTrackText = 'No Track',
    primaryColor = 'var(--text-primary)',
    secondaryColor = 'var(--text-secondary)',
    theme,
    isDaylight,
    isHidden = false,
    hideControlBar = false,
    controlsDisabled = false,
}) => {
    // 视觉回到 10620 原版：收起是窄条、展开是全宽，两种状态一眼可辨。
    const glassBgExpanded = isDaylight ? 'bg-white/60 border border-white/20 shadow-xl' : 'bg-black/40 border border-white/5';
    const glassBgCollapsed = isDaylight ? 'bg-white/40 border border-white/20 shadow-lg hover:bg-white/50' : 'bg-black/20 border border-white/5 hover:bg-black/30';
    const trackColor = isDaylight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)';

    const [isHovered, setIsHovered] = useState(false);
    // 拖动中锁住展开态，松手后仍保持展开，直到点外部才收起。
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [isTimelineOpen, setIsTimelineOpen] = useState(false);
    const isScrubbingRef = useRef(false);
    const isTimelineOpenRef = useRef(false);
    const expandTimeoutRef = useRef<number | null>(null);
    const collapseTimeoutRef = useRef<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const showExpanded = isHovered || isScrubbing;

    useEffect(() => { isTimelineOpenRef.current = isTimelineOpen; }, [isTimelineOpen]);

    const beginScrub = useCallback(() => {
        isScrubbingRef.current = true;
        setIsScrubbing(true);
        setIsHovered(true);
        if (collapseTimeoutRef.current !== null) {
            window.clearTimeout(collapseTimeoutRef.current);
            collapseTimeoutRef.current = null;
        }
    }, []);

    const endScrub = useCallback(() => {
        isScrubbingRef.current = false;
        setIsScrubbing(false);
    }, []);

    // 点外部收起：监听常驻（不随展开态反复挂载），保证「点空白总能缩小」。
    // 明确排除时间线弹窗内部，否则弹窗里一次 pointerdown 会被当成点外部，
    // 直接关掉弹窗 + 收起控件，表现就是「点开之后一滑，那个就消失、按钮还缩小」。
    useEffect(() => {
        const handleOutsidePointerDown = (event: PointerEvent) => {
            if (isScrubbingRef.current || isTimelineOpenRef.current) return;
            const target = event.target;
            if (!(target instanceof Node)) return;
            const el = containerRef.current;
            if (el && el.contains(target)) return;
            if (target instanceof Element) {
                if (target.closest('[data-xuan-timeline]')) return;
                // 其它全屏浮层（设置 / 帮助等）也不该把控件收掉
                if (target.closest('[data-folia-keyboard-window]')) return;
            }
            setIsHovered(false);
        };
        document.addEventListener('pointerdown', handleOutsidePointerDown, true);
        return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    }, []);

    useEffect(() => {
        return () => {
            if (expandTimeoutRef.current !== null) {
                window.clearTimeout(expandTimeoutRef.current);
            }
            if (collapseTimeoutRef.current !== null) {
                window.clearTimeout(collapseTimeoutRef.current);
            }
        };
    }, []);

    const handleMouseEnter = () => {
        if (collapseTimeoutRef.current !== null) {
            window.clearTimeout(collapseTimeoutRef.current);
            collapseTimeoutRef.current = null;
        }
        if (expandTimeoutRef.current !== null) return;
        expandTimeoutRef.current = window.setTimeout(() => {
            setIsHovered(true);
            expandTimeoutRef.current = null;
        }, HOVER_EXPAND_DELAY_MS);
    };

    const handleMouseLeave = () => {
        if (isScrubbingRef.current) return;
        if (expandTimeoutRef.current !== null) {
            window.clearTimeout(expandTimeoutRef.current);
            expandTimeoutRef.current = null;
        }
        if (!isHovered || collapseTimeoutRef.current !== null) return;
        collapseTimeoutRef.current = window.setTimeout(() => {
            setIsHovered(false);
            collapseTimeoutRef.current = null;
        }, HOVER_COLLAPSE_DELAY_MS);
    };

    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        // 按钮、进度条由各自处理，别抢它们的点击
        if ((event.target as Element)?.closest?.('button, [data-xuan-progress]')) return;
        if (currentView === 'home') {
            onNavigateToPlayer();
            return;
        }
        // 播放页点外壳空白处：切换放大 / 缩小
        setIsHovered(prev => !prev);
    };

    if (hideControlBar) {
        return null;
    }

    return (
        <>
            <motion.div
                data-xuan-no-double="true"
                className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-60 w-full flex justify-center transition-all duration-300 pointer-events-none
                    ${currentView === 'home' ? 'max-w-[calc(100vw-120px)] md:max-w-lg' : 'max-w-lg px-4'}`}
                initial={false}
                animate={{
                    opacity: isHidden ? 0 : 1,
                    y: isHidden ? 24 : 0,
                    scale: isHidden ? 0.97 : 1,
                }}
                transition={{ duration: 0.26, ease: 'easeOut' }}
                style={{ pointerEvents: isHidden ? 'none' : 'auto' }}
            >
                <div
                    ref={containerRef}
                    className="pointer-events-auto w-full flex justify-center"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    style={{
                        paddingBottom: `${HOVER_HITBOX_BOTTOM_BUFFER_PX}px`,
                        marginBottom: `${-HOVER_HITBOX_BOTTOM_BUFFER_PX}px`,
                    }}
                >
                    <motion.div
                        layout
                        transition={{ layout: CONTROL_LAYOUT_SPRING }}
                        onClick={handleClick}
                        // 10620 原版视觉：收起 w-[80%] md:w-[60%]，展开 w-full p-3
                        className={`backdrop-blur-3xl shadow-2xl overflow-hidden cursor-pointer rounded-full relative transition-colors duration-300
                            ${showExpanded ? `p-3 ${glassBgExpanded} w-full` : `px-4 py-2 ${glassBgCollapsed} w-[80%] md:w-[60%]`}`}
                    >
                        <motion.div layout transition={{ layout: CONTROL_LAYOUT_SPRING }} className="w-full">
                            {/* 10620 原版网格：展开后播放键在左（跨两行）、歌名在中上、
                                进度条在中下、循环与时间线按钮在右（跨两行）。
                                收起时退化成单行，只剩一条进度条。 */}
                            <div className={showExpanded
                                ? 'grid w-full grid-cols-[1fr_auto_1fr] items-center gap-x-4 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]'
                                : 'flex w-full items-center justify-center'}>
                                {showExpanded && (
                                    <>
                                        {/* Row 1: 居中的歌曲名 */}
                                        <div
                                            className="col-span-3 row-start-1 min-w-0 truncate px-2 text-center text-sm font-bold select-none sm:col-start-2 sm:col-span-1"
                                            style={{ color: primaryColor }}
                                        >
                                            {currentSong?.name || noTrackText}
                                        </div>

                                        {/* 上一首 / 播放暂停 / 下一首
                                            客户端与网页端同一套；网页端同样显示上/下一首。
                                            管理端可通过 config.ui.progressShowPrevNext 关闭。 */}
                                        <div className="col-start-2 row-start-2 flex items-center justify-center gap-1 sm:col-start-1 sm:row-start-1 sm:row-span-2 sm:justify-self-auto">
                                            {(getServerConfig()?.ui?.progressShowPrevNext !== false) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); playerRemote.prev(); }}
                                                    disabled={controlsDisabled}
                                                    aria-label="上一首"
                                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${controlsDisabled ? 'cursor-not-allowed opacity-35' : 'opacity-60 hover:opacity-100'}`}
                                                    style={{ color: primaryColor }}
                                                ><SkipBack size={19} fill="currentColor" /></button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onTogglePlay();
                                                }}
                                                disabled={!canTogglePlay || controlsDisabled}
                                                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-none text-black shadow-lg transition-transform ${controlsDisabled ? 'cursor-not-allowed opacity-45' : 'hover:scale-105'}`}
                                                style={{ backgroundColor: primaryColor, color: 'var(--bg-color)' }}
                                            >
                                                {playerState === PlayerState.PLAYING ? (
                                                    <Pause size={20} fill="currentColor" />
                                                ) : (
                                                    <Play size={20} fill="currentColor" className="ml-1" />
                                                )}
                                            </button>
                                            {(getServerConfig()?.ui?.progressShowPrevNext !== false) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); playerRemote.next(); }}
                                                    disabled={controlsDisabled}
                                                    aria-label="下一首"
                                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${controlsDisabled ? 'cursor-not-allowed opacity-35' : 'opacity-60 hover:opacity-100'}`}
                                                    style={{ color: primaryColor }}
                                                ><SkipForward size={19} fill="currentColor" /></button>
                                            )}
                                        </div>

                                        {/* 循环 + 歌词时间线 */}
                                        <div className="contents sm:col-start-3 sm:row-start-1 sm:row-span-2 sm:flex sm:items-center sm:gap-1">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onToggleLoop();
                                                }}
                                                disabled={controlsDisabled}
                                                className={`col-start-1 row-start-2 justify-self-end rounded-full p-2 transition-colors sm:justify-self-auto ${loopMode !== 'off' ? (isDaylight ? 'bg-black/10 text-black' : 'bg-white/20') : 'opacity-40 hover:opacity-100'} ${controlsDisabled ? 'cursor-not-allowed opacity-35' : ''}`}
                                                style={{ color: primaryColor }}
                                            >
                                                {loopMode === 'off'
                                                    ? <RepeatOff size={20} className="sm:h-[18px] sm:w-[18px]" />
                                                    : loopMode === 'one'
                                                        ? <Repeat1 size={20} className="sm:h-[18px] sm:w-[18px]" />
                                                        : <Repeat size={20} className="sm:h-[18px] sm:w-[18px]" />}
                                            </button>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsTimelineOpen(true);
                                                }}
                                                disabled={!lyrics}
                                                className={`col-start-3 row-start-2 justify-self-start rounded-full p-2 transition-colors sm:justify-self-auto ${!lyrics ? 'cursor-not-allowed opacity-20' : `opacity-40 hover:opacity-100 ${isDaylight ? 'hover:bg-black/5' : 'hover:bg-white/10'}`}`}
                                                style={{ color: primaryColor }}
                                                title="View Lyrics Timeline"
                                            >
                                                <ChartBar size={20} className="sm:h-[18px] sm:w-[18px]" />
                                            </button>
                                        </div>
                                    </>
                                )}

                                {/* 唯一的进度条实例：展开 / 收起都不卸载，DOM 节点常驻，
                                    pointer capture 全程保留，滑动时间线不会「一滑就消失 + 缩回小条」。 */}
                                <div className={showExpanded
                                    ? 'col-span-3 row-start-3 w-full px-2 sm:col-start-2 sm:col-span-1 sm:row-start-2'
                                    : 'flex h-8 w-full items-center justify-center px-4'}>
                                    <ProgressBar
                                        currentTime={currentTime}
                                        duration={duration}
                                        onSeek={onSeek}
                                        onSeekStart={beginScrub}
                                        onSeekEnd={endScrub}
                                        primaryColor={primaryColor}
                                        secondaryColor={secondaryColor}
                                        trackColor={trackColor}
                                        disabled={controlsDisabled}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                </div>
            </motion.div>

            <LyricsTimelineModal
                isOpen={isTimelineOpen}
                onClose={() => setIsTimelineOpen(false)}
                lyrics={lyrics}
                duration={duration}
                currentTime={lyricCurrentTime ?? currentTime}
                onSeek={(time) => {
                    const offset = currentTime.get() - (lyricCurrentTime?.get() ?? currentTime.get());
                    onSeek(Math.max(0, time + offset));
                }}
                primaryColor={primaryColor}
                secondaryColor={secondaryColor}
                accentColor="var(--text-accent)"
                theme={theme}
                isDaylight={isDaylight}
                disabled={controlsDisabled}
            />
        </>
    );
};

export default FloatingPlayerControls;
