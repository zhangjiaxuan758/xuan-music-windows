import React, { useCallback, useEffect, useState } from 'react';
import { getServerConfig, onServerConfigChange } from '../services/xuanServer';

/**
 * 小轩音乐 · 系统公告弹窗（全自绘，不用原生 alert/confirm）
 * ------------------------------------------------------------------
 * 管理端发布公告后服务端 version 自增并 SSE 广播，客户端：
 *   - 启动拿到配置时弹出；
 *   - 切回前台（visibilitychange / Capacitor appStateChange）再检查一次；
 *   - 按公告 id 去重，同一条公告只弹一次，点「确定」后记录 id。
 * 公告内容为空或已关闭时一律不弹。
 */
const LAST_ID_KEY = 'xuan_announcement_last_id';

interface AnnouncementPayload {
    title: string;
    content: string;
    id: number;
}

const readLastId = (): number => {
    try { return Number(localStorage.getItem(LAST_ID_KEY) || 0) || 0; } catch { return 0; }
};

export const AnnouncementController: React.FC = () => {
    const [announcement, setAnnouncement] = useState<AnnouncementPayload | null>(null);

    const check = useCallback((cfg: ReturnType<typeof getServerConfig>) => {
        const a = cfg?.announcement;
        if (!a || !a.enabled) return;
        const content = String(a.content ?? '').trim();
        if (!content) return;
        const id = Number(a.id) || 0;
        if (id <= readLastId()) return;
        setAnnouncement({ title: String(a.title || '公告'), content, id });
    }, []);

    useEffect(() => {
        // onServerConfigChange 会在订阅时立即用当前配置回调一次（启动即检查）。
        const off = onServerConfigChange(check);
        const onForeground = () => {
            if (typeof document === 'undefined' || document.visibilityState === 'visible') {
                check(getServerConfig());
            }
        };
        document.addEventListener('visibilitychange', onForeground);
        window.addEventListener('xuan:app-resume', onForeground);
        window.addEventListener('xuan:server-config', onForeground as EventListener);
        try {
            const w = window as unknown as { __xuanAppStateChange?: () => void };
            w.__xuanAppStateChange = onForeground;
        } catch { /* noop */ }
        return () => {
            off();
            document.removeEventListener('visibilitychange', onForeground);
            window.removeEventListener('xuan:app-resume', onForeground);
            window.removeEventListener('xuan:server-config', onForeground as EventListener);
        };
    }, [check]);

    const close = useCallback(() => {
        if (!announcement) return;
        try { localStorage.setItem(LAST_ID_KEY, String(announcement.id)); } catch { /* noop */ }
        setAnnouncement(null);
    }, [announcement]);

    if (!announcement) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={announcement.title}
            onClick={close}
            style={{
                position: 'fixed', inset: 0, zIndex: 100000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
                userSelect: 'none', WebkitUserSelect: 'none',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: 'min(86vw, 460px)', maxHeight: '72vh',
                    display: 'flex', flexDirection: 'column',
                    background: '#f7f8fa', color: '#26282d',
                    borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,0.35)',
                    overflow: 'hidden',
                }}
            >
                <div style={{
                    padding: '18px 22px 12px', fontSize: 16, fontWeight: 700,
                    letterSpacing: 1, borderBottom: '1px solid rgba(0,0,0,0.07)',
                }}>
                    {announcement.title}
                </div>
                <div style={{
                    padding: '18px 22px', flex: 1, overflowY: 'auto',
                    fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                    {announcement.content}
                </div>
                <div style={{ padding: '10px 22px 20px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={close}
                        style={{
                            minWidth: 108, padding: '10px 18px', border: 'none', borderRadius: 10,
                            background: '#3b6ef5', color: '#fff', fontSize: 13, fontWeight: 600,
                            cursor: 'pointer', userSelect: 'none',
                        }}
                    >
                        确定
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AnnouncementController;
