import { useCallback, useEffect } from 'react';
import type React from 'react';
import type { PlayerChromeVisibilityMode } from '../types/remoteControl';

// src/hooks/usePlayerChromeAutoHide.ts
// 小轩音乐：旧的「自动隐藏 / 三态循环 / 鼠标移动唤醒」已整体移除。
// 沉浸模式只由播放页双击（或 H 快捷键）切换，且不再持久化：
// 每次启动都回到正常模式，彻底避免误开后控件再也回不来、必须重启的问题。
type UsePlayerChromeAutoHideOptions = {
    autoHidePlayerChrome: boolean;
    initialPlayerChromeHidden: boolean;
    setIsPlayerChromeHidden: React.Dispatch<React.SetStateAction<boolean>>;
    setAutoHidePlayerChromePreference: (enabled: boolean) => void;
    onModeChange?: (mode: PlayerChromeVisibilityMode) => void;
};

export const usePlayerChromeAutoHide = ({
    setIsPlayerChromeHidden,
}: UsePlayerChromeAutoHideOptions) => {
    const playerChromeVisibilityMode: PlayerChromeVisibilityMode = 'always-visible';

    useEffect(() => {
        setIsPlayerChromeHidden(false);
        try {
            localStorage.removeItem('player_chrome_visibility_mode');
            localStorage.removeItem('player_chrome_hidden');
        } catch (error) {
            void error;
        }
    }, [setIsPlayerChromeHidden]);

    // 两态切换：显示 -> 沉浸 -> 显示
    const cyclePlayerChromeVisibilityMode = useCallback(() => {
        setIsPlayerChromeHidden(prev => !prev);
    }, [setIsPlayerChromeHidden]);

    return { playerChromeVisibilityMode, cyclePlayerChromeVisibilityMode };
};
