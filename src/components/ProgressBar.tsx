import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { MotionValue, useMotionValueEvent } from 'framer-motion';

interface ProgressBarProps {
    currentTime: MotionValue<number>;
    duration: number;
    onSeek: (time: number) => void;
    onSeekStart?: () => void;
    onSeekEnd?: () => void;
    primaryColor?: string;
    secondaryColor?: string;
    trackColor?: string;
    disabled?: boolean;
}


const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const ProgressBar: React.FC<ProgressBarProps> = ({
    currentTime,
    duration,
    onSeek,
    onSeekStart,
    onSeekEnd,
    primaryColor = 'white',
    secondaryColor = 'rgba(255,255,255,0.5)',
    trackColor = 'rgba(255,255,255,0.1)',
    disabled = false,
}) => {
    const progressRef = useRef<HTMLDivElement>(null);
    const timeRef = useRef<HTMLSpanElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);
    const lastDisplayedSecondRef = useRef<number | null>(null);

    // Keeps continuous progress on the compositor while coarse values update only when needed.
    const updateUI = useCallback((value: number, force = false, syncInput = true, bypassDrag = false) => {
        if (!bypassDrag && isDraggingRef.current) return;

        const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
        const clampedValue = duration > 0 ? Math.min(safeValue, duration) : safeValue;
        const displayedSecond = Math.floor(clampedValue);

        if (progressRef.current) {
            const progress = duration > 0 ? Math.min(1, clampedValue / duration) : 0;
            const hiddenPercent = ((1 - progress) * 100).toFixed(4);
            progressRef.current.style.clipPath = `inset(0 ${hiddenPercent}% 0 0 round 999px)`;
        }

        if (timeRef.current && (force || lastDisplayedSecondRef.current !== displayedSecond)) {
            timeRef.current.textContent = formatTime(clampedValue);
            lastDisplayedSecondRef.current = displayedSecond;
        }

    }, [duration]);

    useLayoutEffect(() => {
        updateUI(currentTime.get(), true);
    }, [currentTime, updateUI]);

    useMotionValueEvent(currentTime, "change", (latest: number) => {
        updateUI(latest);
    });

    // 直接按手指/鼠标的横向位置换算进度：点一下立刻跳，不用等 input 事件，
    // 也不会再出现「点好几次 / 等半天」的情况。拖动时按帧节流。
    // commit=false 只更新进度条视觉；拖动过程中绝不写 audio.currentTime，
    // 否则每帧 seek 会让解码器/DSP 缓冲反复重置，出现「电音 / 杂音」。
    const seekToClientX = useCallback((clientX: number, commit: boolean) => {
        const track = trackRef.current;
        if (!track || duration <= 0) return;
        const rect = track.getBoundingClientRect();
        if (rect.width <= 0) return;
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const nextTime = ratio * duration;
        updateUI(nextTime, false, true, true);
        if (commit) onSeek(nextTime);
    }, [duration, onSeek, updateUI]);

    const rafSeekRef = useRef<number | null>(null);
    const pendingSeekXRef = useRef<number | null>(null);

    const scheduleSeek = (clientX: number) => {
        pendingSeekXRef.current = clientX;
        if (rafSeekRef.current != null) return;
        rafSeekRef.current = requestAnimationFrame(() => {
            rafSeekRef.current = null;
            const x = pendingSeekXRef.current;
            if (x != null) seekToClientX(x, false);
        });
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        // 歌曲刚开播时 stage 处于激活态，controlsDisabled 会短暂为 true。
        // 展开（放大）是纯 UI 交互，不应被禁用；先通知外层展开，
        // seek 本身仍受 disabled 限制，避免「刚播放点进度条没反应」。
        onSeekStart?.();
        if (disabled) {
            // 展开已触发，但不会进入拖动；必须配对 onSeekEnd，
            // 否则外层会一直锁在「拖动中」，导致点外部收不回去。
            onSeekEnd?.();
            return;
        }
        isDraggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        // 点下时外层会从「窄条」展开成「全宽」，轨道宽度此刻还在变化。
        // 用 rAF 等布局稳定后再按最新 rect 换算，避免第一次跳转偏位。
        scheduleSeek(e.clientX);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDraggingRef.current || disabled) return;
        scheduleSeek(e.clientX);
    };

    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        // 松手时一次性提交最终位置（真正 seek 只发生这一次）
        seekToClientX(e.clientX, true);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        onSeekEnd?.();
    };

    const cancelDrag = () => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        updateUI(currentTime.get(), true);
        onSeekEnd?.();
    };

    return (
        <div className="flex items-center gap-3 w-full select-none">
            <span
                ref={timeRef}
                className="text-[10px] font-mono font-medium opacity-60 w-8 text-right"
                style={{ color: secondaryColor }}
            >
                00:00
            </span>

            <div
                ref={trackRef}
                data-xuan-control
                data-xuan-no-double
                data-xuan-progress
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
                onClick={(e) => e.stopPropagation()}
                className={`relative flex-1 h-8 flex items-center select-none touch-none ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                style={{ touchAction: 'none' }}
            >
                <div className="relative w-full h-2 rounded-full" style={{ backgroundColor: trackColor }}>
                    <div
                        ref={progressRef}
                        className="absolute top-0 left-0 h-full rounded-full pointer-events-none"
                        style={{
                            width: '100%',
                            backgroundColor: primaryColor,
                            clipPath: 'inset(0 100% 0 0 round 999px)',
                            willChange: 'clip-path',
                        }}
                    />
                </div>
            </div>

            <span className="text-[10px] font-mono font-medium opacity-60 w-8" style={{ color: secondaryColor }}>
                {formatTime(duration)}
            </span>
        </div>
    );
};

export default ProgressBar;
