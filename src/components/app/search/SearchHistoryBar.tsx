import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, Trash2 } from 'lucide-react';
import {
    readSearchHistory, removeSearchHistoryItem, clearSearchHistory,
} from '../../../services/searchHistory';

type Props = {
    isDaylight: boolean;
    onPick: (query: string) => void;
};

type ConfirmTarget = { item: string; x: number; y: number };

/**
 * 搜索历史：点击回填；长按弹出「删除」小气泡，点确认才删除（与网易云一致）；
 * 右侧按钮清空全部。
 */
export const SearchHistoryBar: React.FC<Props> = ({ isDaylight, onPick }) => {
    const [history, setHistory] = useState<string[]>(() => readSearchHistory());
    const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
    const timerRef = useRef<number | null>(null);
    const longPressedRef = useRef(false);

    useEffect(() => { setHistory(readSearchHistory()); }, []);
    useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

    // 点空白处关闭确认气泡
    useEffect(() => {
        if (!confirmTarget) return;
        const close = () => setConfirmTarget(null);
        document.addEventListener('pointerdown', close, true);
        return () => document.removeEventListener('pointerdown', close, true);
    }, [confirmTarget]);

    if (history.length === 0) return null;

    const chip = isDaylight
        ? 'bg-black/5 text-black/70 hover:bg-black/10'
        : 'bg-white/10 text-white/70 hover:bg-white/15';

    const cancelTimer = () => {
        if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const openConfirm = (item: string, element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        setConfirmTarget({ item, x: rect.left + rect.width / 2, y: rect.top });
    };

    const doDelete = (item: string) => {
        setHistory(removeSearchHistoryItem(item));
        setConfirmTarget(null);
    };

    return (
        <div className="flex items-center gap-2 overflow-x-auto xuan-hide-scrollbar pb-1" data-xuan-search-history>
            <Clock3 size={13} className="shrink-0 opacity-45" />
            {history.map(item => (
                <button key={item} type="button"
                    onTouchStart={(event) => {
                        longPressedRef.current = false;
                        const element = event.currentTarget;
                        cancelTimer();
                        timerRef.current = window.setTimeout(() => {
                            longPressedRef.current = true;
                            timerRef.current = null;
                            openConfirm(item, element);
                        }, 520);
                    }}
                    onTouchEnd={cancelTimer}
                    onTouchMove={cancelTimer}
                    onContextMenu={(event) => {
                        event.preventDefault();
                        longPressedRef.current = true;
                        openConfirm(item, event.currentTarget);
                    }}
                    onClick={() => { if (!longPressedRef.current) onPick(item); }}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors ${chip}`}>
                    {item}
                </button>
            ))}
            <button type="button" onClick={() => setHistory(clearSearchHistory())}
                className="shrink-0 ml-auto rounded-full px-3 py-1.5 text-xs flex items-center gap-1 border border-current/20 opacity-70 hover:opacity-100">
                <Trash2 size={12} /> 清空
            </button>

            {confirmTarget && createPortal(
                <div
                    className="fixed z-[320] -translate-x-1/2 -translate-y-full pb-2"
                    style={{ left: confirmTarget.x, top: confirmTarget.y }}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <div className={`flex items-center gap-1 rounded-2xl border p-1.5 shadow-2xl ${isDaylight
                        ? 'bg-white/95 border-black/10 text-zinc-800'
                        : 'bg-zinc-900/95 border-white/10 text-zinc-100'}`}>
                        <span className="max-w-[140px] truncate px-2 text-[11px] opacity-50">
                            {confirmTarget.item}
                        </span>
                        <button
                            type="button"
                            onClick={() => doDelete(confirmTarget.item)}
                            className="rounded-xl bg-red-500/90 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-red-500"
                        >
                            删除
                        </button>
                        {/* 对齐正版交互：长按只弹「删除」，点其他位置气泡自动消失（外层 pointerdown 已处理） */}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
};
