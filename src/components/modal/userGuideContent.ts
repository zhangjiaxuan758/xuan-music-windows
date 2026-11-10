// src/components/modal/userGuideContent.ts

export type GuidePage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const USER_GUIDE_PAGE_COUNT = 7;
// Android 版不自动弹出桌面端「新功能介绍」，避免首次启动打扰。
export const USER_GUIDE_AUTO_OPEN_VERSION: string | null = null;

// 小轩音乐为 Android 横屏应用，使用指南不再包含任何电脑键盘键位说明。
// 保留空数组以兼容仍引用该导出的旧模块。
export const PLAYER_PAGE_SHORTCUTS: Array<never> = [];
