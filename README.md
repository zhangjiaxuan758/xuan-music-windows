# 小轩音乐 · Windows 客户端（脱敏源码）

本仓库仅含 **Windows 桌面客户端**脱敏源码（Electron 主进程 + 共用前端网络层）。
不含管理端、服务端、网页端，不含任何真实服务器地址、密钥、口令、证书指纹或 GitHub token；
所有敏感值以 `__XUAN_*__` 占位符表示。

> **本软件为闭源专有软件；未经授权强行逆向、破解、篡改、二次分发或绕过校验，须承担相应法律责任。**
> 主服务地址（裸域名，不含路径）以 `__XUAN_SERVER_BASE__` 占位，`inject_private.py` 注入真实值。

## 每个源码文件均嵌入三项
每个 `.ts/.cpp/.cjs/.py/.sh` 文件头部统一带有：主链接占位符、闭源专有软件声明、
强行逆向的法律责任提示。占位符在构建部署时被替换为真实裸域名。

## 结构
- `electron/xuanNetCore.cjs`：PC 主进程加载同一份 C++ wasm 网络核心
- `electron/updateChannels.cjs`：更新通道（已停用会崩的 electron-updater generic provider）
- `src/cpp/`、`src/services/`：与安卓客户端共用的 C++ 核心与动态路由/签名层
- `shared/` 共用模块

## 本地构建
1. 复制 `private.config.example.json` 为 `private.config.json` 并填真实值（已 gitignore）。
2. `python3 inject_private.py` → `python3 gen_secretbox.py`（**必须**）。
3. 完整工程依赖私有构建链，本仓库为核心模块脱敏快照。
