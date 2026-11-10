// src/components/app/presentation/buildPlayerViewFlags.ts

// Builds top-level player-view booleans used by the shell, overlays, and floating controls.
export const buildPlayerViewFlags = ({
    currentView,
    disableHomeDynamicBackground,
    hidePlayerProgressBar,
    hidePlayerTranslationSubtitle,
    hidePlayerRightPanelButton,
    isNowPlayingControlDisabled,
    activePlaybackContext,
    stageActiveEntryKind,
    audioSrc,
    duration,
}: {
    currentView: string;
    disableHomeDynamicBackground: boolean;
    hidePlayerProgressBar: boolean;
    hidePlayerTranslationSubtitle: boolean;
    hidePlayerRightPanelButton: boolean;
    isNowPlayingControlDisabled: boolean;
    activePlaybackContext: 'main' | 'stage';
    stageActiveEntryKind: string | null;
    audioSrc: string | null;
    duration: number;
}) => {
    const isPlayerView = currentView === 'player';
    return {
        isPlayerView,
        shouldPauseVisualizerBackground: currentView !== 'player' && disableHomeDynamicBackground,
        // 旧版「隐藏播放器 UI」开关已整体移除，沉浸模式统一由播放页双击控制。
        // 恒为 false：即使历史 localStorage 里误开过 true，控件也不会再也回不来。
        shouldHidePlayerProgressBar: false,
        shouldHidePlayerTranslationSubtitle: false,
        shouldHidePlayerRightPanelButton: false,
        canToggleCurrentPlayback: !isNowPlayingControlDisabled && Boolean(
            audioSrc || (activePlaybackContext === 'stage' && stageActiveEntryKind === 'lyrics' && duration > 0),
        ),
    };
};
