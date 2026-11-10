/**
 * 小轩音乐 · C++ 引擎 WebAssembly 运行时封装（移动端 / 桌面端共用）
 * --------------------------------------------------------------------
 * 源码: src/cpp/xuan_engine.cpp，编译产物内联于 xuanEngineWasm.ts（base64）。
 * 本封装把 WASM 线性内存映射成 Float32Array / Uint8ClampedArray 视图，
 * 供音效链（逐帧 PCM）与播放器页渲染（逐帧 RGBA）调用。
 *
 * 零 import：WASM 内不含任何环境导入，WebAssembly.instantiate(bytes) 即可，
 * 不依赖 fetch / 文件路径 / 跨域，Android WebView 与 Electron 表现一致。
 */
import { XUAN_ENGINE_WASM_BASE64 } from './xuanEngineWasm';

/** C++ PRESETS[] 的下标，务必与 xuan_engine.cpp 内 PRESETS 顺序一致。 */
export const XUAN_CPP_PRESET_INDEX: Record<string, number> = {
    off: 0,
    superBass: 1,
    clearVocal: 2,
    surround3d: 3,
    panoramic: 4,
    hdVocal: 5,
    hifiLive: 6,
    immersive: 7,
};

export interface XuanCppEngine {
    memory: WebAssembly.Memory;
    /** 左/右声道 PCM 缓冲（直接指向 WASM 内存，长度 2048）。 */
    pcmL: Float32Array;
    pcmR: Float32Array;
    /** 渲染输入：频谱能量（长度 64，0..1）。 */
    spec: Float32Array;
    /** 渲染输出：RGBA 帧缓冲（xe_frame_w * xe_frame_h * 4）。 */
    frame: Uint8ClampedArray;
    frameW: number;
    frameH: number;
    init(sampleRate: number): void;
    /** enabled=false 仍保留常驻隐藏超重低音；enabled=true 再叠加一层 + 用户预设。 */
    setState(enabled: boolean, presetId: number): void;
    /** 对 pcmL/pcmR 就地处理 n 帧。 */
    process(n: number): void;
    /** 生成一帧 RGBA 到 frame。 */
    render(w: number, h: number, timeSec: number, bands: number): void;
}

interface WasmExports {
    memory: WebAssembly.Memory;
    xe_pcm_l_ptr(): number;
    xe_pcm_r_ptr(): number;
    xe_spec_ptr(): number;
    xe_frame_ptr(): number;
    xe_frame_w(): number;
    xe_frame_h(): number;
    xe_init(sr: number): void;
    xe_set_state(enabled: number, presetId: number): void;
    xe_process(n: number): void;
    xe_render(w: number, h: number, t: number, bands: number): void;
}

const MAX_FRAMES = 2048;
const MAX_BANDS = 64;

const decodeBase64 = (b64: string): Uint8Array => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

let enginePromise: Promise<XuanCppEngine | null> | null = null;

const buildEngine = (bytes: Uint8Array): Promise<XuanCppEngine | null> =>
    WebAssembly.instantiate(bytes as unknown as BufferSource, {})
        .then(({ instance }) => {
            const e = instance.exports as unknown as WasmExports;
            if (!e.memory || !e.xe_process || !e.xe_render) return null;
            const buf = e.memory.buffer;
            const fw = e.xe_frame_w();
            const fh = e.xe_frame_h();
            const engine: XuanCppEngine = {
                memory: e.memory,
                pcmL: new Float32Array(buf, e.xe_pcm_l_ptr(), MAX_FRAMES),
                pcmR: new Float32Array(buf, e.xe_pcm_r_ptr(), MAX_FRAMES),
                spec: new Float32Array(buf, e.xe_spec_ptr(), MAX_BANDS),
                frame: new Uint8ClampedArray(buf, e.xe_frame_ptr(), fw * fh * 4),
                frameW: fw,
                frameH: fh,
                init: (sr) => e.xe_init(sr),
                setState: (enabled, presetId) => e.xe_set_state(enabled ? 1 : 0, presetId),
                process: (n) => e.xe_process(n),
                render: (w, h, t, bands) => e.xe_render(w, h, t, bands),
            };
            // 默认采样率先初始化（隐藏超重低音立即生效），链路 attach 时会按真实 sr 再 init。
            engine.init(44100);
            return engine;
        })
        .catch((err) => {
            console.warn('[XuanCpp] engine instantiate failed', err);
            return null;
        });

/** 获取（并缓存）C++ 引擎单例。加载失败返回 null，调用方需具备降级路径。 */
export const getXuanCppEngine = (): Promise<XuanCppEngine | null> => {
    if (!enginePromise) {
        try {
            enginePromise = buildEngine(decodeBase64(XUAN_ENGINE_WASM_BASE64));
        } catch (err) {
            console.warn('[XuanCpp] base64 decode failed', err);
            enginePromise = Promise.resolve(null);
        }
    }
    return enginePromise;
};
