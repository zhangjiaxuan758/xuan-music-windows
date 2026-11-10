// 小轩音乐 · 静态资源离线兜底
// --------------------------------------------------------------------
// 断网 / 图片地址失效时，浏览器默认会显示「裂图」图标。这里在 document 上
// 用捕获阶段监听所有 <img> 的 error，统一替换为内嵌的中性色软件占位图，
// 并在恢复联网后把原地址还回去重试一次。
const PLACEHOLDER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">'
    + '<rect width="128" height="128" fill="#2b2b30"/>'
    + '<circle cx="64" cy="64" r="34" fill="none" stroke="#8b8b93" stroke-width="4"/>'
    + '<circle cx="64" cy="64" r="9" fill="#8b8b93"/>'
    + '<path d="M64 30v34l24 10" stroke="#8b8b93" stroke-width="4" fill="none" stroke-linecap="round"/>'
    + '</svg>';

export const XUAN_OFFLINE_PLACEHOLDER =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(PLACEHOLDER_SVG);

let installed = false;

function applyFallback(img: HTMLImageElement) {
    if (img.dataset.xuanFallback === '1') return;
    img.dataset.xuanOriginalSrc = img.getAttribute('src') || '';
    img.dataset.xuanFallback = '1';
    img.src = XUAN_OFFLINE_PLACEHOLDER;
    img.style.objectFit = 'cover';
    img.style.opacity = '1';
}

export function installOfflineImageGuard(): void {
    if (installed || typeof document === 'undefined') return;
    installed = true;

    document.addEventListener('error', (event: Event) => {
        const target = event.target;
        if (target instanceof HTMLImageElement) applyFallback(target);
    }, true);

    window.addEventListener('offline', () => {
        document.querySelectorAll('img').forEach(node => {
            const img = node as HTMLImageElement;
            if (!img.complete || img.naturalWidth === 0) applyFallback(img);
        });
    });

    window.addEventListener('online', () => {
        document.querySelectorAll('img[data-xuan-fallback="1"]').forEach(node => {
            const img = node as HTMLImageElement;
            const original = img.dataset.xuanOriginalSrc;
            if (original) img.src = original;
            delete img.dataset.xuanFallback;
        });
    });
}

/** 预热同源静态资源（图标 / 帮助页 / 入口页），断网打开也拿得到。 */
export async function precacheStaticAssets(): Promise<void> {
    if (typeof caches === 'undefined' || typeof window === 'undefined') return;
    try {
        const cache = await caches.open('xuan-static-v1');
        const urls = ['/icon.svg', '/favicon.png', '/index.html', '/help.html'];
        await Promise.all(urls.map(async url => {
            try { await cache.add(new Request(url, { cache: 'reload' })); } catch { /* noop */ }
        }));
    } catch { /* noop */ }
}
