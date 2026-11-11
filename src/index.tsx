import { Buffer } from 'buffer';
import { installGlobalVisualizerFrameRateLimiter } from './utils/frameRateLimiter';
import { initXuanServer } from './services/xuanServer';
import { installOfflineImageGuard, precacheStaticAssets } from './services/offlineImageGuard';
import { initSystemEqualizer } from './services/audioEffects';
import { initAppUpdater } from './services/appUpdater';
void initXuanServer();
// 更新检查在最早时机并行发起：不等待 React 挂载 / 配置拉取 / 音效初始化，
// 一旦服务端有新版本，弹窗第一时间覆盖呈现。
void initAppUpdater();
// @ts-ignore
globalThis.Buffer = Buffer;
installGlobalVisualizerFrameRateLimiter();

// 断网兜底：任何图片加载失败都替换成中性色软件占位图，不再出现「图片损坏」裂图；
// 同时预热同源静态资源、探测并启用 Android 系统均衡器。
installOfflineImageGuard();
void precacheStaticAssets();
void initSystemEqualizer().then(ok => {
    if (!ok) window.setTimeout(() => void initSystemEqualizer(), 1500);
});

void import('./bootstrap');
