// 小轩音乐：直连网易云官方服务器（music.163.com / eapi）。
// 不注入任何界面元素，也不需要用户填写任何地址；装上点「登录」即可扫码。
window.__XUAN_RUNTIME_CONFIG__ = window.__XUAN_RUNTIME_CONFIG__ || {};

(function () {
  'use strict';

  // 本版只保留网易云音源。
  try { window.localStorage.setItem('active_online_provider_id', 'netease'); } catch (e) {}

  // 清理旧版本残留的第三方公共实例地址与探活标记，避免覆盖安装后留下误导配置。
  // 新网络层不再读取这些值，全部请求固定发往 music.163.com 官方域名。
  try {
    window.localStorage.removeItem('xuan.server.netease');
    window.sessionStorage.removeItem('xuan.probe.done');
  } catch (e) {}
})();
