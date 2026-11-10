#!/usr/bin/env bash
# 小轩音乐 C++ 引擎 → WebAssembly（安卓 WebView 与 Electron 共用同一份产物）
# 依赖：clang 18（自带 wasm32 target 与 wasm-ld），无需 Emscripten / NDK。
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
OUT="$SRC/../services/wasm/xuan_engine.wasm"
mkdir -p "$(dirname "$OUT")"

clang++ --target=wasm32 -O3 -nostdlib -fno-exceptions -fno-rtti \
    -Wl,--no-entry -Wl,--export-all -Wl,--export-memory \
    -Wl,--allow-undefined -Wl,--strip-all \
    -o "$OUT" "$SRC/xuan_engine.cpp"

# 校验魔数与零 import
python3.11 - "$OUT" <<'PY'
import sys, struct
p = sys.argv[1]
d = open(p, 'rb').read()
assert d[:4] == b'\x00asm', 'not a wasm file'
print('wasm bytes =', len(d), '| magic OK')

# 解析 import 段（id=2），必须为 0 个 import
i = 8
def uleb(b, i):
    r = s = 0
    while True:
        x = b[i]; i += 1
        r |= (x & 0x7f) << s
        if not (x & 0x80): break
        s += 7
    return r, i
imports = 0
while i < len(d):
    sid = d[i]; i += 1
    size, i = uleb(d, i)
    end = i + size
    if sid == 2:
        cnt, j = uleb(d, i)
        imports = cnt
    i = end
print('wasm imports =', imports, '(应为 0)')
PY
echo "BUILD_WASM_DONE -> $OUT"
