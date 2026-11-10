import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsUiStore } from '../../stores/useSettingsUiStore';
import { COMMAND_PALETTE_COMMANDS } from '../command-palette/commandRegistry';
import type { Theme } from '../../types';
import { UserGuidePageContent } from './UserGuidePageContent';
import { UserGuideFooter } from './UserGuideFooter';
import { USER_GUIDE_PAGE_COUNT, type GuidePage } from './userGuideContent';

export const UserGuideModal: React.FC<{ theme?: Theme | null }> = ({ theme }) => {
    const { t } = useTranslation();
    const isUserGuideModalOpen = useSettingsUiStore(state => state.isUserGuideModalOpen);
    const setIsUserGuideModalOpen = useSettingsUiStore(state => state.setIsUserGuideModalOpen);
    const isDaylight = useSettingsUiStore(state => state.isDaylight);
    const [page, setPage] = useState<GuidePage>(1);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Reset to page 1 whenever the modal is reopened
    useEffect(() => {
        if (isUserGuideModalOpen) {
            setPage(1);
        }
    }, [isUserGuideModalOpen]);

    const bgClass = isDaylight ? 'bg-white border-zinc-200' : 'bg-[#18181b] border-zinc-800';
    const textPrimary = isDaylight ? 'text-zinc-900' : 'text-zinc-50';
    const textSecondary = isDaylight ? 'text-zinc-500' : 'text-zinc-400';
    const btnClass = isDaylight
        ? 'bg-gradient-to-r from-zinc-800 to-zinc-900 hover:from-zinc-700 hover:to-zinc-800 text-white shadow-xl shadow-zinc-900/10'
        : 'bg-gradient-to-r from-zinc-100 to-white hover:from-white hover:to-zinc-100 text-zinc-900 shadow-xl shadow-white/10';
    const secondaryBtnClass = isDaylight
        ? 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50'
        : 'text-zinc-400 hover:text-zinc-50 hover:bg-white/10';
    const cardBg = isDaylight
        ? 'bg-zinc-50 border border-zinc-100'
        : 'bg-zinc-800/50 border border-zinc-700/50';
    const keyBg = isDaylight ? 'bg-white border border-zinc-200' : 'bg-white/10';
    const tipCardBg = isDaylight ? 'bg-zinc-50/90 border-zinc-100' : 'bg-white/[0.04] border-white/10';
    const iconTileBg = isDaylight ? 'bg-white shadow-sm' : 'bg-white/10';
    const guideCommands = COMMAND_PALETTE_COMMANDS.filter(c => c.id !== 'queue' && !c.id.startsWith('navigate'));

    const goToPage = (nextPage: GuidePage) => {
        setPage(nextPage);
        // 切页后回到顶部，否则会停在上页的滚动位置，看起来像「划不动」。
        requestAnimationFrame(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = 0;
        });
    };

    const goNext = () => {
        if (page >= USER_GUIDE_PAGE_COUNT) {
            setIsUserGuideModalOpen(false);
            return;
        }

        goToPage((page + 1) as GuidePage);
    };

    const goBack = () => {
        if (page <= 1) {
            return;
        }

        goToPage((page - 1) as GuidePage);
    };

    return (
        <AnimatePresence>
            {isUserGuideModalOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
                    onClick={() => setIsUserGuideModalOpen(false)}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 10 }}
                        transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                        onClick={(e) => e.stopPropagation()}
                        className={`${bgClass} border rounded-[2rem] max-w-lg w-full max-h-[85vh] p-8 shadow-2xl relative overflow-hidden flex flex-col`}
                    >
                        <div className="absolute right-4 top-4 z-20 flex items-center gap-1">
                            {page > 1 && (
                                <button
                                    type="button"
                                    onClick={goBack}
                                    aria-label={t('userGuide.back', 'Back')}
                                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${isDaylight ? 'bg-black/5 hover:bg-black/10 text-zinc-700' : 'bg-white/10 hover:bg-white/15 text-zinc-100'}`}
                                >
                                    <ArrowLeft size={16} />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setIsUserGuideModalOpen(false)}
                                aria-label={t('common.close', 'Close')}
                                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${isDaylight ? 'bg-black/5 hover:bg-black/10 text-zinc-700' : 'bg-white/10 hover:bg-white/15 text-zinc-100'}`}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="absolute inset-0 pointer-events-none z-0">
                            <div
                                className={`absolute -top-24 -right-24 w-64 h-64 rounded-full blur-[80px] ${isDaylight ? 'opacity-20' : 'opacity-10'}`}
                                style={{ backgroundColor: theme?.accentColor || (isDaylight ? '#60a5fa' : '#3b82f6') }}
                            />
                            <div
                                className={`absolute -bottom-24 -left-24 w-64 h-64 rounded-full blur-[80px] ${isDaylight ? 'opacity-20' : 'opacity-10'}`}
                                style={{ backgroundColor: theme?.secondaryColor || theme?.accentColor || (isDaylight ? '#c084fc' : '#a855f7') }}
                            />
                        </div>

                        <div
                            ref={scrollRef}
                            data-xuan-scroll
                            className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain xuan-hide-scrollbar pr-1"
                            style={{
                                touchAction: 'pan-y',
                                // Android WebView 上 -webkit-overflow-scrolling:touch 与
                                // transform 动画叠加后容易出现「滑几次就卡住」，这里用 auto。
                                WebkitOverflowScrolling: 'auto',
                            }}
                        >
                            <motion.div
                                key={`page-${page}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.12 }}
                            >
                                <UserGuidePageContent
                                    page={page}
                                    pageCount={USER_GUIDE_PAGE_COUNT}
                                    isDaylight={isDaylight}
                                    classes={{
                                        textPrimary,
                                        textSecondary,
                                        cardBg,
                                        keyBg,
                                        tipCardBg,
                                        iconTileBg,
                                    }}
                                    guideCommands={guideCommands}
                                />
                            </motion.div>
                        </div>

                        <div className="relative z-10 shrink-0 pt-5">
                            <UserGuideFooter
                                page={page}
                                pageCount={USER_GUIDE_PAGE_COUNT}
                                btnClass={btnClass}
                                secondaryBtnClass={secondaryBtnClass}
                                backLabel={t('userGuide.back', 'Back')}
                                nextLabel={t('userGuide.next', 'Next')}
                                tipsLabel={t('userGuide.tips', 'Usage tips')}
                                doneLabel={t('userGuide.gotIt', 'Got it')}
                                onBack={goBack}
                                onNext={goNext}
                                onClose={() => setIsUserGuideModalOpen(false)}
                            />
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
