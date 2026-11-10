// 网易云官方 eapi 的 /api/song/enhance/player/url/v1 对会员 / 付费 / 无版权
// 歌曲不下发中文提示，而是返回结构化字段：
//   data[0].code  (-110 需付费或会员、-103/-105 版权或地区限制)
//   data[0].fee   (1 VIP、4 付费数字专辑、8 高音质、0 免费)
//   data[0].freeTrialInfo / freeTrialPrivilege.cannotListenReason
//   song.resourceState / song.noCopyrightRcmd.typeDesc
// 这里按官方客户端的判定口径把这些字段归一成「受限原因」，
// 再由 UI 层用本地化文案展示；官方若给了 message / typeDesc 则原样优先展示。

export type NeteaseRestrictionReason =
    | 'offline'        // 无网络连接
    | 'vip'            // 会员专享
    | 'paid-album'     // 付费数字专辑
    | 'trial'          // 仅试听片段
    | 'no-copyright'   // 版权方下架 / 无版权
    | 'region'         // 版权或地区限制
    | 'login-required' // 未登录：网易云已不再向匿名请求下发播放/试听链接
    | 'unknown';       // 其它官方受限

export interface NeteasePlaybackRestriction {
    reason: NeteaseRestrictionReason;
    code?: number;
    fee?: number;
    trialSeconds?: number;
    /** 官方返回的原始文案（data[0].message 或 noCopyrightRcmd.typeDesc） */
    officialMessage?: string;
}

export class NeteasePlaybackRestrictionError extends Error {
    constructor(public readonly restriction: NeteasePlaybackRestriction) {
        super('netease_playback_restricted');
        this.name = 'NeteasePlaybackRestrictionError';
    }
}

type RestrictionSong = {
    fee?: number | null;
    resourceState?: boolean | null;
    noCopyrightRcmd?: { typeDesc?: string } | null;
};

const parseTrialSeconds = (entry: any): number | undefined => {
    let info = entry?.freeTrialInfo;
    if (typeof info === 'string') {
        try { info = JSON.parse(info); } catch { info = null; }
    }
    const end = Number(info?.end);
    const start = Number(info?.start ?? 0);
    if (Number.isFinite(end) && end > 0) {
        return Math.max(1, Math.round(end - start));
    }
    return undefined;
};

/** 从官方取链条目 + 歌曲元数据解析受限原因。能正常播放时由调用方直接返回 url。 */
export const describeNeteaseRestriction = (
    entry: any,
    song?: RestrictionSong | null,
): NeteasePlaybackRestriction => {
    const code = Number(entry?.code);
    const fee = Number(entry?.fee ?? song?.fee ?? 0);
    const trialSeconds = parseTrialSeconds(entry);
    const officialMessage = typeof entry?.message === 'string' && entry.message.trim()
        ? entry.message.trim()
        : typeof song?.noCopyrightRcmd?.typeDesc === 'string' && song.noCopyrightRcmd.typeDesc.trim()
            ? song.noCopyrightRcmd.typeDesc.trim()
            : undefined;

    const base: NeteasePlaybackRestriction = {
        reason: (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'unknown',
        ...(Number.isFinite(code) && code !== 0 ? { code } : {}),
        ...(Number.isFinite(fee) ? { fee } : {}),
        ...(trialSeconds ? { trialSeconds } : {}),
        ...(officialMessage ? { officialMessage } : {}),
    };

    // 官方明确标记资源失效 / 无版权（优先采用官方 typeDesc 文案）
    if (song?.resourceState === false || fee < 0) {
        return { ...base, reason: 'no-copyright' };
    }
    // 官方 code：-110 需付费 / 会员；-103 / -105 版权或地区限制
    if (code === -110) {
        return { ...base, reason: fee === 4 ? 'paid-album' : 'vip' };
    }
    if (code === -103 || code === -105) {
        return { ...base, reason: 'region' };
    }
    // 仅返回试听片段
    if (trialSeconds) {
        return { ...base, reason: fee === 4 ? 'paid-album' : 'trial' };
    }
    if (Number.isFinite(fee) && fee >= 1) {
        return { ...base, reason: fee === 4 ? 'paid-album' : 'vip' };
    }
    return base;
};
