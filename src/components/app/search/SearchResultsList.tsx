import React, { useEffect, useMemo, useRef } from 'react';
import { List, useListRef } from 'react-window';
import type { UnifiedSong } from '../../../types';
import type { MediaId } from '../../../types/onlineMusic';
import SearchResultRow from './SearchResultRow';

// src/components/app/search/SearchResultsList.tsx

type SearchResultsListProps = {
    tracks: UnifiedSong[];
    scrollTop: number;
    isDaylight: boolean;
    onScrollTopChange: (scrollTop: number) => void;
    onReachBottom?: (atBottom: boolean) => void;
    onPlayTrack: (track: UnifiedSong) => void;
    onAddTrackToQueue: (track: UnifiedSong) => void;
    onOpenArtist: (track: UnifiedSong, artistName: string, artistId?: MediaId, entityId?: string) => void;
    onOpenAlbum: (track: UnifiedSong, albumName: string, albumId?: MediaId, entityId?: string) => void;
};

type RowProps = Omit<SearchResultsListProps, 'scrollTop' | 'onScrollTopChange' | 'onReachBottom'>;

const Row = ({ index, style, tracks, ...props }: { index: number; style: React.CSSProperties } & RowProps) => (
    <SearchResultRow track={tracks[index]} style={style} {...props} />
);

const SearchResultsList: React.FC<SearchResultsListProps> = ({
    tracks,
    scrollTop,
    onScrollTopChange,
    onReachBottom,
    ...rowProps
}) => {
    const listRef = useListRef(null);
    const latestScrollTopRef = useRef(scrollTop);
    const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const atBottomRef = useRef(false);
    const stableRowProps = useMemo(() => ({ tracks, ...rowProps }), [rowProps, tracks]);

    // 结果数量变化后重新判定「是否已在底部」；内容不足一屏时不会触发滚动事件，
    // 此时直接视为已到底，保证「加载更多」仍可出现。
    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            const element = listRef.current?.element;
            if (!element) return;
            const atBottom = element.scrollHeight <= element.clientHeight + 1;
            if (atBottomRef.current !== atBottom) {
                atBottomRef.current = atBottom;
                onReachBottom?.(atBottom);
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [tracks.length, onReachBottom]);

    useEffect(() => {
        const element = listRef.current?.element;
        if (element && Math.abs(element.scrollTop - scrollTop) > 1) {
            element.scrollTop = scrollTop;
        }
        latestScrollTopRef.current = scrollTop;
    }, [listRef, scrollTop, tracks]);

    useEffect(() => () => {
        if (commitTimerRef.current) {
            clearTimeout(commitTimerRef.current);
        }
        onScrollTopChange(latestScrollTopRef.current);
    }, [onScrollTopChange]);

    return (
        <List
            listRef={listRef}
            rowCount={tracks.length}
            rowHeight={76}
            rowComponent={Row as any}
            rowProps={stableRowProps}
            overscanCount={6}
            className="custom-scrollbar"
            style={{ height: '100%', width: '100%', touchAction: 'pan-y' }}
            onScroll={(event) => {
                const element = event.currentTarget;
                latestScrollTopRef.current = element.scrollTop;
                // 距底部不足一行时才算滑到底。
                const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 76;
                if (atBottomRef.current !== atBottom) {
                    atBottomRef.current = atBottom;
                    onReachBottom?.(atBottom);
                }
                if (commitTimerRef.current) {
                    clearTimeout(commitTimerRef.current);
                }
                commitTimerRef.current = setTimeout(() => {
                    onScrollTopChange(latestScrollTopRef.current);
                }, 120);
            }}
        />
    );
};

export default SearchResultsList;
