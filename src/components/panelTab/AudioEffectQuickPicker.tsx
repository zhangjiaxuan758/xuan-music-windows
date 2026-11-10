import React, { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    readXuanAudioEffects,
    writeXuanAudioEffects,
    availableXuanEffectPresets,
    XUAN_EFFECT_CHANGE_EVENT,
    type XuanAudioEffectSettings,
    type XuanEffectPreset,
} from '../../services/audioEffects';

type Props = {
    isDaylight: boolean;
    accentColor?: string;
};

/**
 * 播放控制里的音效快捷面板：开关 + 7 种固定预设。无自定义强度调节。
 * 状态规则（修复"开关自己变化"问题）：
 *  - 只在用户操作时写入 localStorage（挂载绝不回写，避免旧状态覆盖新状态）
 *  - 监听全局变更事件，与其他入口/管理端远程配置保持同步
 */
export const AudioEffectQuickPicker: React.FC<Props> = ({ isDaylight, accentColor }) => {
    const { t } = useTranslation();
    const [settings, setSettings] = useState<XuanAudioEffectSettings>(() => readXuanAudioEffects());

    useEffect(() => {
        const sync = () => setSettings(readXuanAudioEffects());
        window.addEventListener(XUAN_EFFECT_CHANGE_EVENT, sync);
        return () => window.removeEventListener(XUAN_EFFECT_CHANGE_EVENT, sync);
    }, []);

    const update = (next: XuanAudioEffectSettings) => {
        setSettings(next);
        writeXuanAudioEffects(next);
    };

    const accent = accentColor || 'rgba(114,119,134,1)';
    const wellBg = isDaylight ? 'bg-black/5' : 'bg-black/20';
    const activeOptionBg = isDaylight ? 'bg-white shadow-sm' : 'bg-white/20 shadow-sm';
    const inactiveChip = isDaylight ? 'border-black/10 hover:bg-black/5' : 'border-white/15 hover:bg-white/5';

    return (
        <div className="pt-2 border-t border-white/5 space-y-3" data-xuan-audio-effect>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <SlidersHorizontal size={13} className="opacity-40" />
                    <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest">{t('effects.title')}</span>
                    <span className="text-[10px] font-bold opacity-70">
                        {settings.enabled ? t(availableXuanEffectPresets().find(p => p.value === settings.preset)?.i18nKey || 'effects.off') : t('effects.off')}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => update({ ...settings, enabled: !settings.enabled })}
                    className={`h-5 w-9 rounded-full p-0.5 transition-colors shrink-0 ${!settings.enabled ? (isDaylight ? 'bg-black/15' : 'bg-white/15') : ''}`}
                    style={settings.enabled ? { backgroundColor: accent } : undefined}
                    aria-pressed={settings.enabled}
                >
                    <span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${settings.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
            </div>

            <div className={`grid grid-cols-4 gap-1.5 ${wellBg} p-1.5 rounded-xl`}>
                {availableXuanEffectPresets().filter(preset => preset.value !== 'off').map(preset => {
                    const active = settings.enabled && settings.preset === preset.value;
                    return (
                        <button
                            key={preset.value}
                            type="button"
                            onClick={() => update({ ...settings, preset: preset.value as XuanEffectPreset, enabled: true })}
                            className={`shrink-0 rounded-lg px-1 py-1.5 text-[10px] font-bold leading-tight transition-all border ${active ? activeOptionBg : inactiveChip}`}
                            style={active ? { color: accent, borderColor: 'transparent' } : { color: 'var(--text-secondary)', borderColor: 'transparent' }}
                        >
                            {t(preset.i18nKey)}
                        </button>
                    );
                })}
            </div>

            <p className="text-[10px] opacity-30 leading-4">
                {t('effects.hint')}
            </p>
        </div>
    );
};

export default AudioEffectQuickPicker;
