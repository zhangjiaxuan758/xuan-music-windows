# 小轩音乐 · Windows 端源码（占位符脱敏版）

> **这是给其他人参考的脱敏源码，不是可直接编译出可用 APK 的完整工程。**
> 所有敏感信息均已替换为 `__PLACEHOLDER_xxx__` 占位符，签名密钥、含密码的说明文件、
> 本地环境变量、编译产物一律未入库。
>
> - 仓库：https://github.com/zhangjiaxuan758/xuan-music-windows
> - 版本：1.6.9（versionCode 10629，Android 10–16，V1/V2/V3 签名）
> - 本仓库为 Windows 桌面端（Electron）客户端脱敏源码：共用前端 + `desktop/` 桌面壳 + `src/cpp/` C++ 音效/渲染引擎。
> 移动端源码见 `xuan-music-android` 仓库。
> - 音效 DSP 与播放器页渲染全部由 C++ 实现（`src/cpp/xuan_engine.cpp` → WebAssembly），
>   移动端与桌面端共用同一份编译产物；可用 `bash src/cpp/build_wasm.sh` 重建（需 clang 18 + wasm-ld）。
> - 架构：Capacitor + React + TypeScript，客户端直连网易云官方 `music.163.com/eapi`，
>   零私密凭证、账号 Cookie 只存在使用者设备本地。
>
> ## 需要自行补齐的占位符
>
> | 位置 | 占位符 | 说明 |
> |---|---|---|
> | `src/services/netease.ts` | `__PLACEHOLDER_NETEASE_EAPI_KEY__` / `__PLACEHOLDER_NETEASE_EAPI_SALT__` | 网易云 eapi 公开协议常量，官方网页 JS 中可查 |
> | `.env.local` | 见 `.env.example` | 本地配置，不入库 |
> | 签名 | 自备 `.jks` | 发布 APK 需自己的签名证书 |
>
> 补齐后执行：`npm install` → `npm run build:capacitor` → `npx cap sync android` →
> `cd android && ./gradlew assembleRelease`，再用 apksigner 做 V1/V2/V3 签名。
>
> ## 安全提醒
>
> 任何随 APK 下发或运行时从公网拉取的内容都不是秘密。请勿把 AppSecret / RSA 私钥 /
> 账号 Cookie 放进客户端或公开仓库；如需自建服务端，密钥只放服务端环境变量，
> 客户端只拿短时签名令牌。

---

# 小轩音乐 · Android

> 源码仓库：https://github.com/zhangjiaxuan758/xuan-music-windows （软件设置「关于」页与帮助文档均指向此地址）


小轩音乐 1.6.5（包名 `com.music.xuan`），基于 Capacitor 的 Android 横屏全屏音乐播放器。

## 交付物

- 安装包：`小轩音乐_v1.6.5.apk`（V1 + V2 + V3 签名，同一证书可覆盖安装）
- 源码工程：本目录
- 签名证书、构建步骤、安全说明：`签名信息.txt`

## 主要特性

- 强制横屏 + 沉浸式全屏，摄像头挖孔区域铺满，适配 Android 10 ~ Android 16
- 网易云音乐官方 eapi 直连，扫码登录，安装即用、无需配置后端
- 只保留网易云音源；搜索首屏 50 首，滑到底才显示「加载更多」
- 会员专享 / 付费数字专辑 / 无版权 / 地区限制按网易云官方口径提示，不误报「已下架」
- 首页「开发者推荐」固定 12 首，可在「设置 → 常规」里开关显隐
- 播放页双击两下进入 / 退出沉浸模式；右下角常显返回上一页按钮
- 播放 / 暂停音量淡入淡出

## 二次构建

见 `签名信息.txt` 中的「二次构建步骤」。

## 关于仓库

本项目已去除上游仓库的全部引用。若要展示你自己的 GitHub 仓库，把地址填入
`src/components/modal/AiHelpPromptModal.tsx` 的 `XUAN_REPOSITORY_URL`，
并按需更新 `package.json` 的 repository 字段即可。
