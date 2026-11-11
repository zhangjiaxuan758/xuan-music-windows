import React from 'react';
import { BookOpen, Music2, Search, Heart, SlidersHorizontal, WifiOff, ExternalLink as HelpLink } from 'lucide-react';

export const XUAN_HELP_DOC_URL = 'https://music.jrr.lol/help.html';

/** 小轩音乐自编的帮助文档：内容围绕本应用，仓库链接指向用户自己的 xuan-music。 */
export const XuanHelpDoc: React.FC<{ isDaylight: boolean }> = ({ isDaylight }) => {
    const card = isDaylight ? 'bg-black/[0.035] border-black/10' : 'bg-white/[0.04] border-white/10';
    const sections: Array<{ icon: React.ReactNode; title: string; body: string }> = [
        { icon: <Music2 size={15} />, title: '登录', body: '打开应用后在首页点「登录网易云账号」，用网易云 App 扫码即可。扫码后如提示环境异常，请确认网络正常后重试；登录态只保存在你自己的手机里。' },
        { icon: <Search size={15} />, title: '搜索与播放', body: '搜索结果只来自网易云官方。点歌曲封面或整行空白处即可播放；点歌手名查看歌曲信息。搜索框内容在切换页面后仍会保留。' },
        { icon: <Heart size={15} />, title: '点赞 / 收藏 / 歌单', body: '点赞、收藏、添加到歌单等操作需要先登录网易云账号；未登录时会提示你先登录。搜索和听歌不受登录限制。' },
        { icon: <SlidersHorizontal size={15} />, title: '音效与音质', body: '设置里可开启音效并选择 7 种固定预设，无需自定义调节；关闭音效时音频完全直通、不经过任何处理。音质默认使用官方最高档，官方按账号权限自动降级。' },
        { icon: <HelpLink size={15} />, title: '在线帮助文档', body: '完整版《遇到问题？》文档托管在小轩音乐官方站点，包含登录、播放、音效音质、更新等全部排查步骤。' },
        { icon: <WifiOff size={15} />, title: '离线与缓存', body: '默认开启音乐缓存。无网络时会提示「无网络连接」；已缓存的会员歌曲仍按网易云官方口径提示试听或不可播放。设置里可清理缓存。' },
        { icon: <BookOpen size={15} />, title: '会员歌曲提示', body: '会员专享、付费数字专辑、无版权、地区限制等歌曲，均按网易云官方口径提示，不会误显示「已下架」。已登录且账号有会员时可播放完整版。' },
    ];
    return (
        <div className="space-y-3" data-xuan-help-doc>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>小轩音乐 · 使用与问题排查</div>
            <div className="text-xs opacity-60" style={{ color: 'var(--text-secondary)' }}>
                版本 {__APP_VERSION__} · com.music.xuan · Android 10–16 横屏全屏
            </div>
            {sections.map(s => (
                <div key={s.title} className={`rounded-xl border p-3 ${card}`}>
                    <div className="flex items-center gap-2 text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                        {s.icon} {s.title}
                    </div>
                    <div className="text-xs leading-relaxed opacity-70" style={{ color: 'var(--text-secondary)' }}>{s.body}</div>
                </div>
            ))}
            <a href={XUAN_HELP_DOC_URL} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs underline opacity-70 hover:opacity-100">
                <HelpLink size={13} /> 打开在线帮助文档
            </a>
        </div>
    );
};
