// 小轩音乐：搜索历史本地持久化。只存关键词，不上传、不联网。
const KEY = 'xuan_search_history';
const MAX = 20;
export const readSearchHistory = (): string[] => {
    try {
        const raw = localStorage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x.trim()).slice(0, MAX) : [];
    } catch { return []; }
};
export const pushSearchHistory = (query: string): string[] => {
    const q = query.trim();
    if (!q) return readSearchHistory();
    const next = [q, ...readSearchHistory().filter(x => x !== q)].slice(0, MAX);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
};
export const removeSearchHistoryItem = (query: string): string[] => {
    const next = readSearchHistory().filter(x => x !== query);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
};
export const clearSearchHistory = (): string[] => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    return [];
};
