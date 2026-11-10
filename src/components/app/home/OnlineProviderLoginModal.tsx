import { Loader2, RotateCcw, X } from 'lucide-react';
import { motion } from 'framer-motion';
import neteaseLogo from '../../../../build/netease-logo.png';

// src/components/app/home/OnlineProviderLoginModal.tsx

type OnlineProviderLoginModalProps = {
    title: string;
    note: string;
    qrCodeImg: string;
    statusText: string;
    state: 'idle' | 'loading' | 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'error';
    retryLabel: string;
    closeLabel: string;
    onRetry: () => void;
    onClose: () => void;
};

const OnlineProviderLoginModal = ({
    title,
    note,
    qrCodeImg,
    statusText,
    state,
    retryLabel,
    closeLabel,
    onRetry,
    onClose,
}: OnlineProviderLoginModalProps) => {
    const canRetry = state === 'expired' || state === 'error';
    return (
        // 外层本身作为滚动容器：横屏屏幕高度较小时，二维码卡片可能高于可视区域，
        // 原先 absolute inset-0 + flex 居中会让内容被祖先的 overflow-hidden 裁掉且无法滑动。
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-black/60 p-3"
            data-xuan-scroll
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            {/* min-h-full 让内容不足一屏时保持居中，超出一屏时从顶部开始并可上下滑动 */}
            <div className="flex min-h-full w-full flex-col items-center justify-start">
                <motion.div
                    initial={{ scale: 0.92, opacity: 0, y: 24 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.92, opacity: 0, y: 12 }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                    className="bg-zinc-900/90 border border-white/10 p-6 rounded-3xl max-w-sm w-full text-center relative shadow-2xl my-auto shrink-0"
                >
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={closeLabel}
                        className="absolute top-4 right-4 opacity-40 hover:opacity-100 rounded-full bg-white/5 p-1 transition-colors cursor-pointer"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        <X size={16} />
                    </button>
                    <img src={neteaseLogo} alt="网易云音乐" className="w-10 h-10 rounded-2xl mx-auto mb-2 shadow-md" />
                    <h3 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>{title}</h3>
                    <div className="relative inline-block bg-white p-2 rounded-xl mb-4 shadow-inner">
                        {qrCodeImg ? (
                            <img src={qrCodeImg} alt="QR Code" className="w-36 h-36" />
                        ) : (
                            <div className="w-36 h-36 flex items-center justify-center bg-gray-100 rounded-lg">
                                <Loader2 className="animate-spin text-gray-400" size={24} />
                            </div>
                        )}
                    </div>
                    <p className={`text-xs font-medium mt-2 ${state === 'confirmed' ? 'text-green-400' : 'opacity-60'}`} style={{ color: state === 'confirmed' ? undefined : 'var(--text-secondary)' }}>
                        {statusText}
                    </p>
                    {canRetry && (
                        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold transition-colors">
                            <RotateCcw size={13} />
                            {retryLabel}
                        </button>
                    )}
                    <p className="text-[10px] opacity-30 mt-4" style={{ color: 'var(--text-secondary)' }}>{note}</p>
                </motion.div>
            </div>
        </motion.div>
    );
};

export default OnlineProviderLoginModal;
