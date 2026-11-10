import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Check, Copy, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../types';
import { XuanHelpDoc } from './XuanHelpDoc';
import { X as CloseIcon } from 'lucide-react';

// src/components/modal/AiHelpPromptModal.tsx

// 小轩音乐：「遇到问题 / 使用说明」文档一律跳到自建 help.html，不再跳 GitHub。
const FOLIA_GUIDE_URL = 'https://music.jrr.lol/help.html';
const FOLIA_DOCS_URL = 'https://music.jrr.lol/help.html';
const XUAN_REPOSITORY_URL = 'https://github.com/zhangjiaxuan758/xuan-music';
const FOLIA_REPOSITORY_URL = XUAN_REPOSITORY_URL;

type AiHelpPromptModalProps = {
    isOpen: boolean;
    isDaylight: boolean;
    theme?: Theme;
    onClose: () => void;
    onCopyText: (text: string) => Promise<void>;
};

export const AiHelpPromptModal: React.FC<AiHelpPromptModalProps> = ({
    isOpen,
    isDaylight,
    theme,
    onClose,
    onCopyText,
}) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);

    const prompt = useMemo(() => t('aiHelp.prompt', {
        guideUrl: FOLIA_GUIDE_URL,
        repoUrl: FOLIA_REPOSITORY_URL,
        defaultValue: [
            '我正在使用「小轩音乐」Android 版（1.6.5 / com.music.xuan），遇到一个问题需要帮助。',
            '',
            `使用说明：${FOLIA_GUIDE_URL}`,
            `源码仓库：${FOLIA_REPOSITORY_URL}`,
            '',
            '小轩音乐是横屏全屏的 Android 音乐应用，客户端直连网易云官方接口，音源只来自网易云；',
            '登录态只保存在本机；搜索与听歌不需要登录，点赞 / 收藏 / 加歌单需要登录。',
            '',
            '请先阅读上面的说明与仓库 README，再结合我下面描述的具体问题给出排查步骤。',
            '如果信息不足，请先向我确认，再给出可以安全尝试的操作步骤。'
        ].join('\n')
    }), [t]);

    const bgClass = isDaylight ? 'bg-white border-zinc-200' : 'bg-[#18181b] border-zinc-800';
    const textPrimary = isDaylight ? 'text-zinc-900' : 'text-zinc-50';
    const textSecondary = isDaylight ? 'text-zinc-500' : 'text-zinc-400';
    const panelBg = isDaylight ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.04] border-white/10';
    const primaryBtnClass = isDaylight
        ? 'bg-zinc-900 text-white hover:bg-zinc-700'
        : 'bg-white text-zinc-950 hover:bg-zinc-200';
    const secondaryBtnClass = isDaylight
        ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
        : 'border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white';

    const handleCopyPrompt = async () => {
        try {
            await onCopyText(prompt);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch (error) {
            console.error('Failed to copy AI help prompt:', error);
            setCopied(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.96, opacity: 0, y: 16 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.96, opacity: 0, y: 8 }}
                        transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                        onClick={(event) => event.stopPropagation()}
                        className={`${bgClass} ${textPrimary} relative flex w-full max-w-3xl max-h-[92vh] flex-col overflow-hidden rounded-[1.5rem] border p-6 shadow-2xl`}
                    >
                        <div
                            className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full blur-[72px]"
                            style={{ backgroundColor: theme?.accentColor ?? '#60a5fa', opacity: isDaylight ? 0.2 : 0.12 }}
                        />



                        <button type="button" onClick={onClose} aria-label="关闭"
                            className="absolute right-4 top-4 z-20 rounded-full bg-white/10 p-2 opacity-70 transition hover:opacity-100">
                            <CloseIcon size={18} />
                        </button>

                        <div data-xuan-scroll className="relative z-10 flex-1 min-h-0 space-y-5 overflow-y-auto overscroll-contain xuan-hide-scrollbar pr-1">
                            {/* 小轩音乐自编文档：内容围绕本应用，仓库链接指向 xuan-music。 */}
                            <div className="rounded-xl p-1">
                                <XuanHelpDoc isDaylight={isDaylight} />
                            </div>
                            <div className="pr-10">
                                <h2 className="text-xl font-semibold">{t('aiHelp.title', 'Need help?')}</h2>
                                <p className={`mt-2 text-sm leading-6 ${textSecondary}`}>
                                    {t('aiHelp.description', 'Check the 小轩音乐 documentation first. If the issue remains unresolved, copy the prompt below and ask an AI model for help.')}
                                </p>
                            </div>

                            <a
                                href={FOLIA_DOCS_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-3 rounded-xl border p-4 transition hover:-translate-y-0.5 ${panelBg}`}
                            >
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isDaylight ? 'bg-white' : 'bg-white/10'}`}>
                                    <BookOpen size={19} style={{ color: theme?.accentColor ?? '#60a5fa' }} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold">{t('aiHelp.docsTitle', 'Read the 小轩音乐 documentation')}</span>
                                    <span className={`mt-1 block text-xs leading-5 ${textSecondary}`}>
                                        {t('aiHelp.docsDescription', 'Find usage instructions, configuration details, and troubleshooting guidance.')}
                                    </span>
                                </span>
                                <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${textSecondary}`}>
                                    {t('aiHelp.openDocs', 'Open docs')}
                                    <ExternalLink size={14} />
                                </span>
                            </a>

                            <div>
                                <h3 className="text-sm font-semibold">{t('aiHelp.askAiTitle', 'Still need help? Ask AI')}</h3>
                                <p className={`mt-1 text-xs leading-5 ${textSecondary}`}>
                                    {t('aiHelp.askAiDescription', 'Describe your issue, then paste this prompt so the AI can use 小轩音乐 documentation and source code as context.')}
                                </p>
                            </div>

                            <div className={`rounded-xl border p-4 ${panelBg}`}>
                                <pre className={`whitespace-pre-wrap break-words text-xs leading-5 ${textSecondary}`}>
                                    {prompt}
                                </pre>
                            </div>

                            <div className={`rounded-xl border p-3 text-sm leading-6 ${panelBg} ${textSecondary}`}>
                                {t('aiHelp.usageHint', 'How to use it: open the AI model site you normally use, write your specific problem first, then paste this prompt below your question.')}
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${secondaryBtnClass}`}
                                >
                                    {t('ui.cancel', 'Cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleCopyPrompt()}
                                    className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${primaryBtnClass}`}
                                >
                                    {copied ? <Check size={16} /> : <Copy size={16} />}
                                    {copied ? t('status.copied', 'Copied') : t('aiHelp.copyPrompt', 'Copy prompt')}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
