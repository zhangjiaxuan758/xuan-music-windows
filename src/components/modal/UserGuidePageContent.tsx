import React from 'react';
import { Command, Palette, Search, Sparkles, WandSparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CommandPaletteCommand } from '../command-palette/types';
import { UserGuideFeatureCard } from './UserGuideFeatureCard';
import { UserGuideTipCard } from './UserGuideTipCard';
import type { GuidePage } from './userGuideContent';
import { NewFeaturesIntro } from './NewFeaturesIntro';
import foliaIcon from '../../../build/icon.png';

// src/components/modal/UserGuidePageContent.tsx
// 小轩音乐是 Android 横屏应用：使用指南只保留触屏与登录相关说明，
// 不再出现键盘按键、Ctrl/Cmd、系统托盘、标题栏等桌面端内容。

type UserGuideClassNames = {
    textPrimary: string;
    textSecondary: string;
    cardBg: string;
    keyBg: string;
    tipCardBg: string;
    iconTileBg: string;
};

type UserGuidePageContentProps = {
    page: GuidePage;
    pageCount: number;
    isDaylight: boolean;
    classes: UserGuideClassNames;
    guideCommands: CommandPaletteCommand[];
};

const InfoCard: React.FC<{
    title: string;
    description: string;
    cardBg: string;
    textPrimary: string;
    textSecondary: string;
}> = ({ title, description, cardBg, textPrimary, textSecondary }) => (
    <div className={`p-4 rounded-xl transition-colors ${cardBg}`}>
        <div className={`font-bold text-sm mb-1 ${textPrimary}`}>{title}</div>
        <div className={`text-xs ${textSecondary} leading-relaxed`}>{description}</div>
    </div>
);

export const UserGuidePageContent: React.FC<UserGuidePageContentProps> = ({
    page,
    pageCount,
    isDaylight,
    classes,
    guideCommands,
}) => {
    const { t } = useTranslation();
    const {
        textPrimary,
        textSecondary,
        cardBg,
        keyBg,
        tipCardBg,
        iconTileBg,
    } = classes;
    // 保留解构以维持既有的样式契约，但本版不再渲染任何按键徽标。
    void keyBg;
    void pageCount;
    const tipCardClasses = { iconTileBg, tipCardBg, textPrimary, textSecondary };
    const featureCardClasses = { iconTileBg, cardBg, textPrimary, textSecondary };
    const infoCardClasses = { cardBg, textPrimary, textSecondary };

    if (page === 1) {
        return (
            <>
                <NewFeaturesIntro
                    isDaylight={isDaylight}
                    classes={{ textPrimary, textSecondary, tipCardBg, iconTileBg, cardBg }}
                />
            </>
        );
    }

    if (page === 2) {
        return (
            <>
                <UserGuideTipCard
                    {...tipCardClasses}
                    icon={Command}
                    iconClassName={isDaylight ? 'text-blue-500' : 'text-blue-400'}
                    title={t('userGuide.landscape.title', '横屏全屏')}
                    description={t('userGuide.landscape.desc', '小轩音乐专为横屏设计，打开即自动全屏铺满，摄像头挖孔区域也会完整显示内容。')}
                />
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <UserGuideFeatureCard
                        {...featureCardClasses}
                        icon={Sparkles}
                        iconClassName={isDaylight ? 'text-amber-500' : 'text-amber-300'}
                        title={t('userGuide.landscape.immersiveTitle', '沉浸式界面')}
                        description={t('userGuide.landscape.immersiveDesc', '状态栏与导航栏会自动隐藏，从屏幕边缘轻扫可临时唤出系统栏。')}
                    />
                    <UserGuideFeatureCard
                        {...featureCardClasses}
                        icon={Search}
                        iconClassName={isDaylight ? 'text-blue-500' : 'text-blue-400'}
                        title={t('userGuide.landscape.scrollTitle', '页面可滑动')}
                        description={t('userGuide.landscape.scrollDesc', '登录、设置等页面内容较长时，直接用手指上下滑动即可查看全部内容。')}
                    />
                </div>
            </>
        );
    }

    if (page === 3) {
        return (
            <>
                <UserGuideTipCard
                    {...tipCardClasses}
                    icon={Search}
                    iconClassName={isDaylight ? 'text-purple-500' : 'text-purple-400'}
                    title={t('userGuide.typeToSearch.title', '搜索音乐')}
                    description={t('userGuide.typeToSearch.desc', '在搜索框输入歌名或歌手名，即可查找网易云音乐里的歌曲。')}
                />
                <div className="mt-5 space-y-3">
                    <InfoCard
                        {...infoCardClasses}
                        title={t('userGuide.posterSearch.entryTitle', '点按播放')}
                        description={t('userGuide.posterSearch.entryDesc', '点按搜索结果里的封面或歌名，即可立即播放这首歌。')}
                    />
                    <InfoCard
                        {...infoCardClasses}
                        title={t('userGuide.posterSearch.escapeTitle', '加入播放队列')}
                        description={t('userGuide.posterSearch.escapeDesc', '点按每首歌右侧的加号，可以把它加入播放队列稍后收听。')}
                    />
                </div>
            </>
        );
    }

    if (page === 4) {
        const touchTips: Array<[string, string]> = [
            [t('userGuide.touch.play', '播放 / 暂停'), t('userGuide.touch.playDesc', '点按播放控件或封面即可开始、暂停播放。')],
            [t('userGuide.touch.skip', '切换歌曲'), t('userGuide.touch.skipDesc', '左右滑动封面，或点按上一首 / 下一首按钮。')],
            [t('userGuide.touch.seek', '调整进度'), t('userGuide.touch.seekDesc', '点按或拖动进度条，跳到想听的位置。')],
            [t('userGuide.touch.lyrics', '查看歌词'), t('userGuide.touch.lyricsDesc', '进入播放页即可看到逐行滚动的歌词。')],
        ];
        return (
            <>
                <UserGuideTipCard
                    {...tipCardClasses}
                    icon={Command}
                    iconClassName={isDaylight ? 'text-blue-500' : 'text-blue-400'}
                    title={t('userGuide.shortcutsPageTitle', '播放与手势')}
                    description={t('userGuide.shortcutsPageSubtitle', '在手机上用点按和滑动即可完成全部播放操作。')}
                />
                <div className="mt-5">
                    <ul className="space-y-2 text-sm">
                        {touchTips.map(([title, description]) => (
                            <li key={title} className={`flex items-center justify-between gap-4 p-3.5 rounded-xl transition-colors ${cardBg}`}>
                                <span className={`font-medium min-w-0 ${textPrimary}`}>{title}</span>
                                <span className={`text-xs text-right shrink-0 max-w-[60%] ${textSecondary}`}>{description}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </>
        );
    }

    if (page === 5) {
        return (
            <>
                <UserGuideTipCard
                    {...tipCardClasses}
                    icon={Command}
                    iconClassName={isDaylight ? 'text-blue-500' : 'text-blue-400'}
                    title={t('userGuide.commandPalette.title', '常用功能')}
                    description={t('userGuide.commandPalette.desc', '在设置与功能面板中可以直接打开下面这些常用功能。')}
                />
                <div className="mt-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {guideCommands.map(cmd => (
                            <div key={cmd.id} className={`p-3.5 rounded-xl transition-colors ${cardBg}`}>
                                <div className={`font-bold text-sm mb-1 ${textPrimary}`}>{t(`commandPalette.commands.${cmd.id}.title`, cmd.title)}</div>
                                <div className={`text-xs ${textSecondary} leading-relaxed`}>{t(`commandPalette.commands.${cmd.id}.description`, cmd.description)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </>
        );
    }

    if (page === 6) {
        return (
            <>
                <UserGuideTipCard
                    {...tipCardClasses}
                    icon={Palette}
                    iconClassName={isDaylight ? 'text-rose-500' : 'text-rose-300'}
                    title={t('userGuide.theme.title', '主题配色')}
                    description={t('userGuide.theme.desc', '可以自定义浅色与深色主题，也能根据当前歌曲生成专属配色。')}
                />
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <UserGuideFeatureCard
                        {...featureCardClasses}
                        icon={Palette}
                        iconClassName={isDaylight ? 'text-rose-500' : 'text-rose-300'}
                        title={t('options.openThemePark', '主题公园')}
                        description={t('userGuide.theme.customDesc', '在外观设置里打开主题公园，编辑并保存自己的浅色、深色配色。')}
                    />
                    <UserGuideFeatureCard
                        {...featureCardClasses}
                        icon={WandSparkles}
                        iconClassName={isDaylight ? 'text-purple-500' : 'text-purple-300'}
                        title={t('ui.generateAITheme', '歌曲配色')}
                        description={t('userGuide.theme.aiDesc', '配置好相关选项后，可以根据正在播放的歌曲自动生成主题配色。')}
                    />
                </div>
            </>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[240px] py-6 text-center">
            <div className={`w-28 h-28 rounded-[1.75rem] overflow-hidden ${isDaylight ? 'bg-black/[0.03]' : 'bg-white/5'} border ${isDaylight ? 'border-black/10' : 'border-white/10'} flex items-center justify-center mb-5 shadow-lg`}>
                <img src={foliaIcon} alt="小轩音乐" className="w-full h-full object-cover" />
            </div>
            <h2 className={`text-3xl font-bold mb-3 ${textPrimary}`}>
                {t('userGuide.ready.title', '准备就绪')}
            </h2>
            <p className={`text-sm ${textSecondary} max-w-xs leading-relaxed`}>
                {t('userGuide.ready.subtitle', '尽情享受您的音乐之旅。')}
            </p>
        </div>
    );
};
