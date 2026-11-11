import type { AudioQualityPreference } from '../../types/onlineMusic';
import { readProviderSessionValue } from './providerStorage';

// 小轩音乐：音质档位的登录 / 会员门槛。
//
// 音质本身是网易云官方 /api/song/enhance/player/url/v1 的 level 参数直连：
//   standard 标准(128k) / higher 较高(192k) / exhigh 极高(320k)
//   lossless 无损(FLAC) / hires Hi-Res
// 官方对「未登录」「非会员」的高码率请求会降级或返回受限，这里在端到端对齐
// 官方口径：未登录只能用标准，无损与 Hi-Res 需要会员。

/** 首页扫码登录弹窗的请求事件（音质门槛等处可跨组件唤起）。 */
export const XUAN_REQUEST_LOGIN_EVENT = 'xuan:request-netease-login';
/** 登录成功后通知设置层恢复用户此前选择的音质。 */
export const XUAN_LOGIN_CONFIRMED_EVENT = 'xuan:netease-login-confirmed';

export type QualityTier = 'free' | 'login' | 'vip';

/**
 * 官方全部档位（从高到低）。用户要求：网易云官方 API 支持的所有音质都要能切换。
 * 官方 level：jymaster 超清母带 / sky 沉浸环绕声 / jyeffect 高清环绕声 /
 * hires Hi-Res / lossless 无损 / exhigh 极高320k / higher 较高192k / standard 标准128k。
 */
export const FULL_QUALITY_CHAIN: AudioQualityPreference[] = [
    'jymaster', 'sky', 'jyeffect', 'hires', 'lossless', 'exhigh', 'higher', 'standard',
];

/** 旧档位值兼容：'high' 是早期"极高320k"的内部写法。 */
export const normalizeQuality = (quality: AudioQualityPreference): AudioQualityPreference =>
    quality === 'high' ? 'exhigh' : quality;

/**
 * 各档位需要的身份等级（公开口径，来自官方取链接口对账号权限的普遍行为）：
 * 标准 / 较高：免费可用；极高：需登录；无损 / Hi-Res / 沉浸环绕 / 超清母带：需会员。
 */
export const qualityTier = (quality: AudioQualityPreference): QualityTier => {
    const q = normalizeQuality(quality);
    if (q === 'auto') return 'free'; // 自动档按账号权限动态解析最高可用，不做门槛
    if (q === 'lossless' || q === 'hires' || q === 'jyeffect' || q === 'sky' || q === 'jymaster') return 'vip';
    if (q === 'exhigh') return 'login';
    return 'free';
};

export const isNeteaseLoggedIn = (): boolean =>
    Boolean(readProviderSessionValue('netease', 'cookie', ['netease_cookie']));

export interface QualityCheckResult {
    allowed: boolean;
    reason?: 'login' | 'vip';
}

/**
 * 切换音质前的校验。
 * - 标准：任何人都可用
 * - 极高：需要登录
 * - 无损 / Hi-Res：需要登录且是会员
 */
export const checkQualityChange = (
    quality: AudioQualityPreference,
    isVip: boolean | undefined,
): QualityCheckResult => {
    // 与网易云官方一致：无损及以上档位必须是登录会员；极高需要登录。
    // 会员状态未知一律按「非会员」处理，杜绝「没会员也能用无损」。
    const tier = qualityTier(quality);
    const loggedIn = isNeteaseLoggedIn();
    if (tier === 'vip') {
        if (!loggedIn) return { allowed: false, reason: 'login' };
        if (isVip !== true) return { allowed: false, reason: 'vip' };
    } else if (tier === 'login' && !loggedIn) {
        return { allowed: false, reason: 'login' };
    }
    return { allowed: true };
};

const PENDING_LOGIN_KEY = 'xuan_pending_login';

/**
 * 唤起网易云扫码登录弹窗。
 * 首页（Grid3D）在播放页会被完全卸载，此时事件无人接收，因此额外写一个
 * pending 标记：切回首页后 Grid3D 挂载时会消费它并自动弹出二维码。
 * 标记先删再弹，天然去重，两个触发路径都调它也不会弹两次。
 */
export const requestNeteaseLogin = (): void => {
    if (typeof window === 'undefined') return;
    try { window.sessionStorage.setItem(PENDING_LOGIN_KEY, '1'); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(XUAN_REQUEST_LOGIN_EVENT));
};

/** 首页挂载时调用：消费 pending 标记并触发登录（返回是否触发）。 */
export const consumePendingLogin = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        if (window.sessionStorage.getItem(PENDING_LOGIN_KEY) !== '1') return false;
        window.sessionStorage.removeItem(PENDING_LOGIN_KEY);
    } catch { return false; }
    return true;
};

/**
 * 实际取链时的档位：未登录 / 登录非会员 / 会员一律从用户所选档位
 * （默认最高 jymaster）起步，由 FULL_QUALITY_CHAIN 依次降级重试，
 * 官方按账号权限返回它能给的最高档，最终以官方 br/level 显示真实档位。
 */
export const resolveEffectiveQuality = (
    quality: AudioQualityPreference,
    isVip: boolean,
): AudioQualityPreference => {
    const q = normalizeQuality(quality);
    // 「自动」= 账号能播放的最高档：会员从超清母带起步、非会员从极高起步，
    // 官方取链接口按账号权限自动降级，最终以官方 br/level 显示真实档位。
    if (q === 'auto') return isVip ? 'jymaster' : 'exhigh';
    // 官方对非会员请求 lossless/hires/sky/jymaster 一律降级，
    // 这里直接从源头压到极高(320k)，不再向官方索取会员档位。
    if (!isVip && (q === 'lossless' || q === 'hires' || q === 'jyeffect' || q === 'sky' || q === 'jymaster')) {
        return 'exhigh';
    }
    return q;
};

/**
 * 用官方 /api/song/enhance/player/url/v1 的返回反推实际音质。
 * 优先用官方 level 字段（standard/higher/exhigh/lossless/hires/sky/jymaster），
 * 缺失时按码率(br)反推。官方会按账号权限降级，所以"当前用上了哪一档"
 * 必须以官方返回为准，不能用用户点选的档位。
 */
export const qualityFromOfficialLevel = (
    level: unknown,
    br: unknown,
    requested: AudioQualityPreference,
): AudioQualityPreference => {
    const lv = String(level || '');
    const ALL: AudioQualityPreference[] = [
        'standard', 'higher', 'exhigh', 'lossless', 'hires', 'jyeffect', 'sky', 'jymaster',
    ];
    if (ALL.includes(lv as AudioQualityPreference)) return lv as AudioQualityPreference;
    const rate = Number(br);
    if (!Number.isFinite(rate) || rate <= 0) return normalizeQuality(requested);
    if (rate >= 1900000) return 'hires';
    if (rate >= 900000) return 'lossless';
    if (rate >= 190000) return 'exhigh';
    return 'standard';
};

/** @deprecated 兼容旧调用（br 反推）。 */
export const qualityFromOfficialBr = (
    br: unknown,
    requested: AudioQualityPreference,
): AudioQualityPreference => qualityFromOfficialLevel(null, br, requested);
