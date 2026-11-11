import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LogOut, SlidersHorizontal, HardDrive, Trash2, RefreshCw, Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AudioQualityPreference, ProviderUser } from '../../types/onlineMusic';
import { useOnlineProviderAccountStore } from '../../stores/useOnlineProviderAccountStore';
import { omni } from '../../services/onlineMusic/omni';
import { useSettingsUiStore } from '../../stores/useSettingsUiStore';
import { checkQualityChange } from '../../services/onlineMusic/audioQualityGate';

interface AccountTabProps {
    user: ProviderUser | null;
    onLogout: () => void;
    audioQuality: AudioQualityPreference;
    onAudioQualityChange: (quality: AudioQualityPreference) => void;
    cacheSize: string;
    onClearCache: () => void;
    onSyncData: () => void;
    isSyncing: boolean;
    onNavigateHome: () => void;
}

const AUDIO_QUALITY_OPTIONS: Array<{
    value: AudioQualityPreference;
    labelKey: string;
}> = [
    { value: 'auto', labelKey: 'account.qualityAuto' },
    { value: 'standard', labelKey: 'account.qualityStandard' },
    { value: 'higher', labelKey: 'account.qualityHigher' },
    { value: 'exhigh', labelKey: 'account.qualityExhigh' },
    { value: 'lossless', labelKey: 'account.qualityLossless' },
    { value: 'hires', labelKey: 'account.qualityHires' },
    { value: 'jyeffect', labelKey: 'account.qualityJyeffect' },
    { value: 'sky', labelKey: 'account.qualitySky' },
    { value: 'jymaster', labelKey: 'account.qualityJymaster' },
];

const AccountTab: React.FC<AccountTabProps> = ({
    user,
    onLogout,
    audioQuality,
    onAudioQualityChange,
    cacheSize,
    onClearCache,
    onSyncData,
    isSyncing,
    onNavigateHome,
}) => {
    const { t } = useTranslation();
    const activeProviderId = useOnlineProviderAccountStore(state => state.activeProviderId);
    const providerAccount = useOnlineProviderAccountStore(state => state.accounts[state.activeProviderId]);
    const clearProviderAccount = useOnlineProviderAccountStore(state => state.clearAccount);
    const activeUser = providerAccount?.user || (activeProviderId === 'netease' ? user : null);

    // 音质按网易云官方真实权限：默认「自动」= 账号能播放的最高音质
    // （会员从超清母带起步、非会员从极高起步），用户可手动切任意档。
    const [qualityHint, setQualityHint] = useState('');
    const isVip = Number((activeUser as any)?.vipType ?? 0) > 0;
    // 实时同步网易云当前账号能使用的最高音质：会员档只有会员账号可用；
    // 用户手动点选的档位不会被自动改写。
    const VIP_ONLY: AudioQualityPreference[] = ['lossless', 'hires', 'jyeffect', 'sky', 'jymaster'];
    const effectiveQuality: AudioQualityPreference =
        audioQuality === 'auto' ? 'auto'
            : !isVip && VIP_ONLY.includes(audioQuality) ? 'exhigh' : audioQuality;
    const maxAvailableLabel = isVip ? '超清母带（会员）' : '极高（当前账号可用最高档）';
    const handleQualitySelect = (value: AudioQualityPreference) => {
        const gate = checkQualityChange(value, isVip);
        if (!gate.allowed) {
            setQualityHint(gate.reason === 'login'
                ? '请先登录网易云账号后再使用该音质'
                : '该音质为网易云会员专享，当前账号不是会员');
            return;
        }
        setQualityHint('');
        onAudioQualityChange(value);
    };

    const handleLogout = async () => {
        if (activeProviderId === 'netease') {
            onLogout();
            return;
        }
        await omni.logout(activeProviderId);
        clearProviderAccount(activeProviderId);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col justify-start gap-4 h-full"
        >
            {activeUser ? (
                /* User Info with Logout in Header */
                <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden">
                            <img
                                src={activeUser.avatarUrl?.replace('http:', 'https:')}
                                className="w-full h-full object-cover"
                                alt={activeUser.nickname}
                            />
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <h3 className="font-bold text-sm">{activeUser.nickname}</h3>
                                {Boolean(activeUser.vipType && activeUser.vipType !== 0) && (
                                    <Crown size={14} className="text-white fill-white" />
                                )}
                            </div>
                            <span className="block text-[10px] opacity-50">{omni.getProviderLabel(activeProviderId)}</span>
                            <span className="text-[10px] font-mono opacity-40">ID: {String(activeUser.id)}</span>
                        </div>
                    </div>
                    <button
                        onClick={() => void handleLogout()}
                        className="p-2 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"
                        title={t('account.logout')}
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-4 text-center opacity-50">
                    <p>{t('account.guestMode')}</p>
                    <button
                        onClick={onNavigateHome}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold"
                    >
                        {t('account.loginOnHome')}
                    </button>
                </div>
            )}

            {/* Provider-independent audio quality preference; each online provider maps these semantic presets. */}
            <div className="bg-white/5 p-3 rounded-xl">
                <div className="flex items-center gap-2 mb-2 opacity-60">
                    <SlidersHorizontal size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wide">
                        {t('account.audioQuality')}
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {AUDIO_QUALITY_OPTIONS.map(option => (
                        <button
                            key={option.value}
                            type="button"
                            aria-pressed={effectiveQuality === option.value}
                            onClick={() => handleQualitySelect(option.value)}
                            className={`py-1.5 text-[10px] font-medium rounded-lg transition-all ${effectiveQuality === option.value
                                ? 'bg-white/20 shadow-sm'
                                : 'opacity-40 hover:opacity-100 hover:bg-white/5'
                                }`}
                        >
                            {t(option.labelKey)}
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[10px] leading-4 opacity-60">
                    当前可用：{maxAvailableLabel} · 实时同步网易云账号权限
                </p>
                <p className="mt-2 text-[10px] leading-4 opacity-40">
                    {t('account.qualityAutoHint')}
                </p>
                {qualityHint && (
                    <p className="mt-1 text-[10px] leading-4 text-amber-400">{qualityHint}</p>
                )}
            </div>

            {/* Cache Management Section */}
            {/* <div className="bg-white/5 p-3 rounded-xl mb-2">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 opacity-60">
                        <HardDrive size={12} />
                        <span className="text-[10px] font-bold uppercase tracking-wide">
                            {t('account.storage')}
                        </span>
                    </div>
                    <span className="text-[10px] font-mono">{cacheSize}</span>
                </div>
                <button
                    onClick={onClearCache}
                    className="w-full py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded-lg flex items-center justify-center gap-2 text-[10px] font-bold transition-colors"
                >
                    <Trash2 size={12} />
                    {t('account.clearCache')}
                </button>
            </div> */}

            {activeUser && <button
                onClick={onSyncData}
                disabled={isSyncing}
                className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center gap-2 text-xs font-bold opacity-80 transition-colors disabled:opacity-50"
            >
                <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                {isSyncing ? t('account.syncing') : t('account.syncData')}
            </button>}
        </motion.div>
    );
};

export default AccountTab;

