/**
 * 网易云官方 VIP / 付费歌曲判定（全应用共享）。
 *
 * 只以官方 API 返回的 fee / privilege 为准，不做任何臆测：
 *   - fee / privilege.fee === 1 : VIP 歌曲（需会员）
 *   - fee / privilege.fee === 4 : 付费专辑 / 单曲购买
 *   - payed                      : 已标记付费
 *   - privilege.plLevel >= 10    : 高等级试听限制
 *
 * 之所以抽成共享函数：GridView（我喜欢的音乐 / 歌单 / 收藏 / 专辑 / 搜索结果等
 * 所有歌曲列表）与首页 Grid3D（开发者推荐 / 榜单 / 缓存）过去各写一套或干脆漏写，
 * 导致「VIP 小图标只在部分列表出现」。统一在这里判定，任何列表只要拿到歌曲对象
 * 就能正确显示 VIP 标。
 *
 * 对任意输入安全：非对象、无字段一律返回 false。
 */
export const isVipSong = (song: unknown): boolean => {
    if (!song || typeof song !== 'object') return false;
    const raw: any = song as any;
    const fee = Number(raw?.fee ?? 0);
    const privilege: any = raw?.privilege || {};
    const pfee = Number(privilege?.fee ?? 0);
    return fee === 1 || fee === 4 || pfee === 1 || pfee === 4
        || Boolean(raw?.payed) || Number(privilege?.plLevel ?? 0) >= 10;
};
