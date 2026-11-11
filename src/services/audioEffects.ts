import ncaeRaw from './ncaePresets.json';
import { getXuanCppEngine, XUAN_CPP_PRESET_INDEX, type XuanCppEngine } from './wasm/xuanEngine';
import { XUAN_ENGINE_WASM_BASE64 } from './wasm/xuanEngineWasm';

/**
 * 小轩音乐 · 音效引擎（C++ / WebAssembly 版）
 * --------------------------------------------------------------------
 * 音效与播放器页渲染全部由 C++ 实现（src/cpp/xuan_engine.cpp → xuan_engine.wasm），
 * 移动端(Android WebView)与桌面端(Electron)共用同一份编译产物，参数源唯一。
 *
 * 音频链：ScriptProcessorNode 逐帧把 PCM 灌进 WASM 内存，调用 C++ xe_process()
 * 完成 preamp → bt → 10 段 EQ → DRC → 空间/混响 → 限幅，再写回输出。
 * 不再使用任何 Web Audio BiquadFilter / DynamicsCompressor，也不调用系统均衡器。
 *
 * 隐藏默认超重低音：C++ xe_init() 即配置一层常驻「超重低音」，音效关闭时它
 * 照常生效但 UI 完全不显示（settings 仍是 enabled=false / preset=off）；
 * 音效开启后 xe_set_state(1, preset) 在这层之上再叠加一层超重低音 + 用户预设。
 *
 * 音质（网易云官方 API 下发的 level/码率）与本文件无关，不在此处理。
 *
 * 诚实声明：EQ / DRC / se 为公开等效实现与试听逼近值，不宣称精确复现官方。
 */

export type XuanEffectPreset =
    | 'off'
    | 'superBass'
    | 'surround3d'
    | 'panoramic'
    | 'hdVocal'
    | 'clearVocal'
    | 'hifiLive'
    | 'immersive';

export interface NcaeDrc {
    enabled: boolean;
    threshold: number; // dB
    ratio: number;
    attack: number;    // s
    release: number;   // s
    knee: number;      // dB
}

/** 平台无关的完整预设（两端读同一份 JSON 作为展示/校验数据，实际 DSP 在 C++）。 */
export interface XuanEffectPresetData {
    id: XuanEffectPreset;
    name: string;
    version: number;
    preamp: number;
    bt: { bass: number; treble: number };
    eqs: number[];
    rvb: { mode: string; wet: number };
    se: { strength: number; depth: number };
    drc: NcaeDrc;
    space: { wet: number };
    limiterCeilingDb: number;
}
/** 兼容旧类型名。 */
export type XuanEqBand = { type: 'lowshelf' | 'peaking' | 'highshelf'; freq: number; gain: number; q?: number };

interface NcaeFile {
    version: number;
    spec: string;
    chain: string[];
    eq: { freqs: number[]; q: number };
    bt: { bassFreq: number; trebleFreq: number; q: number };
    drc: { threshold: number; ratio: number; attack: number; release: number; knee: number };
    presets: Record<string, {
        name: string;
        preamp: number;
        bt: { bass: number; treble: number };
        eqs: number[];
        rvb: { mode: string; wet: number };
        se: { strength: number; depth: number };
        drc: Partial<NcaeDrc> & { enabled: boolean };
    }>;
}

const NCAE = ncaeRaw as unknown as NcaeFile;
export const SYSTEM_EQ_FREQUENCIES: number[] = NCAE.eq.freqs;

export const computePreampDb = (p: { eqs: number[]; bt: { bass: number; treble: number } }): number => {
    const maxGain = Math.max(0, ...p.eqs, p.bt.bass, p.bt.treble);
    return maxGain > 0 ? -(maxGain + 0.5) : 0;
};

const buildPreset = (id: string, raw: NcaeFile['presets'][string]): XuanEffectPresetData => {
    const base = NCAE.drc;
    const d = raw.drc || { enabled: false };
    return {
        id: id as XuanEffectPreset,
        name: raw.name,
        version: NCAE.version,
        preamp: computePreampDb(raw),
        bt: { bass: raw.bt.bass, treble: raw.bt.treble },
        eqs: raw.eqs.slice(0, 10),
        rvb: { mode: raw.rvb.mode, wet: raw.rvb.wet },
        se: { strength: raw.se.strength, depth: raw.se.depth },
        drc: {
            enabled: d.enabled !== false,
            threshold: d.threshold ?? base.threshold,
            ratio: d.ratio ?? base.ratio,
            attack: d.attack ?? base.attack,
            release: d.release ?? base.release,
            knee: d.knee ?? base.knee,
        },
        space: { wet: raw.rvb.wet },
        limiterCeilingDb: -1.5,
    };
};

export const XUAN_EFFECT_PRESET_DATA = Object.fromEntries(
    Object.entries(NCAE.presets).map(([k, v]) => [k, buildPreset(k, v)]),
) as Record<XuanEffectPreset, XuanEffectPresetData>;

export const XUAN_EFFECT_PRESETS: Array<{ value: XuanEffectPreset; i18nKey: string; label: string }> = [
    { value: 'off', i18nKey: 'effects.off', label: '关闭音效' },
    { value: 'superBass', i18nKey: 'effects.superBass', label: '超重低音' },
    { value: 'surround3d', i18nKey: 'effects.surround3d', label: '3D 环绕' },
    { value: 'panoramic', i18nKey: 'effects.panoramic', label: '全景环绕' },
    { value: 'hdVocal', i18nKey: 'effects.hdVocal', label: '高解析人声' },
    { value: 'clearVocal', i18nKey: 'effects.clearVocal', label: '清澈人声' },
    { value: 'hifiLive', i18nKey: 'effects.hifiLive', label: 'HiFi 现场' },
    { value: 'immersive', i18nKey: 'effects.immersive', label: '震撼全景' },
];

/** 导出与平台无关的共享 JSON（两端读同一份）。 */
export const exportXuanEffectPresetsJson = (): string => JSON.stringify(NCAE, null, 2);

// ---------------------------------------------------------------- 设置存取
export interface XuanAudioEffectSettings {
    enabled: boolean;
    preset: XuanEffectPreset;
    /** 兼容旧存档：新版本不提供任何手动调节，读取时忽略。 */
    intensity?: number;
}

export const XUAN_EFFECT_STORAGE_KEY = 'xuan_audio_effect_settings';
export const XUAN_EFFECT_CHANGE_EVENT = 'xuan-audio-effect-change';

/** 网易云默认音效关闭；底层常驻的隐藏超重低音不属于 UI 开关，不在此体现。 */
const DEFAULT_SETTINGS: XuanAudioEffectSettings = { enabled: false, preset: 'off' };

const serverEffects = (): { enabled: boolean; presets?: string[] } | null => {
    try {
        const w = window as unknown as { __xuanServerConfig?: { effects?: { enabled: boolean; presets?: string[] } } };
        return w.__xuanServerConfig?.effects || null;
    } catch { return null; }
};

export const readXuanAudioEffects = (): XuanAudioEffectSettings => {
    try {
        const raw = localStorage.getItem(XUAN_EFFECT_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const remote = serverEffects();
        const enabled = Boolean(parsed.enabled) && remote?.enabled !== false;
        let preset: XuanEffectPreset = XUAN_EFFECT_PRESETS.some(p => p.value === parsed.preset)
            ? parsed.preset : DEFAULT_SETTINGS.preset;
        if (remote?.presets?.length && !remote.presets.includes(preset)) {
            preset = (remote.presets.find(p => XUAN_EFFECT_PRESETS.some(x => x.value === p)) as XuanEffectPreset) || 'off';
        }
        return { enabled, preset };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
};

export const availableXuanEffectPresets = (): typeof XUAN_EFFECT_PRESETS => {
    const remote = serverEffects();
    const allow = remote?.presets;
    if (!allow?.length) return XUAN_EFFECT_PRESETS;
    return XUAN_EFFECT_PRESETS.filter(p => p.value === 'off' || allow.includes(p.value));
};

export const writeXuanAudioEffects = (settings: XuanAudioEffectSettings) => {
    const safe: XuanAudioEffectSettings = { enabled: !!settings.enabled, preset: settings.preset };
    try { localStorage.setItem(XUAN_EFFECT_STORAGE_KEY, JSON.stringify(safe)); } catch { /* ignore */ }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(XUAN_EFFECT_CHANGE_EVENT, { detail: safe }));
    }
};

/** 兼容旧调用：不支持自定义均衡器，恒返回 null。 */
export const XUAN_CUSTOM_EQ_KEY = 'xuan_custom_eq_bands';
export const readXuanCustomEq = (): number[] | null => {
    try { localStorage.removeItem(XUAN_CUSTOM_EQ_KEY); } catch { /* ignore */ }
    return null;
};
export const writeXuanCustomEq = (_bands: number[] | null): void => {
    try { localStorage.removeItem(XUAN_CUSTOM_EQ_KEY); } catch { /* ignore */ }
};

// ---------------------------------------------------------------- C++ 引擎状态
let cppEngine: XuanCppEngine | null = null;
let cppSampleRate = 44100;
let engineSampleRate = 0;
let appliedPreset: XuanEffectPreset = 'off';
let activeContext: AudioContext | null = null;
let seekDuckNode: GainNode | null = null;
let workletNode: AudioWorkletNode | null = null;

/** 把当前设置推给 C++ 引擎；worklet 存在时同时转发到音频线程实例。 */
const forwardState = (enabled: boolean, presetIndex: number): void => {
    if (cppEngine) cppEngine.setState(enabled, presetIndex);
    if (workletNode) {
        try { workletNode.port.postMessage({ type: 'state', enabled, presetIndex }); } catch { /* noop */ }
    }
};

/** 把当前设置推送给 C++ 引擎。音效关闭时 C++ 仍保留常驻隐藏超重低音层。 */
const applySettings = (settings?: XuanAudioEffectSettings): void => {
    const s = settings || readXuanAudioEffects();
    const presetId: XuanEffectPreset = s.enabled && s.preset !== 'off' ? s.preset : 'off';
    appliedPreset = presetId;
    forwardState(s.enabled && s.preset !== 'off', XUAN_CPP_PRESET_INDEX[presetId] ?? 0);
    if (activeContext && activeContext.state === 'suspended') {
        void activeContext.resume().catch(() => { });
    }
};

/**
 * 切回前台 / 恢复播放时调用：清空 C++ 引擎（含 AudioWorklet 内独立实例）的
 * 滤波器历史、DRC 包络与混响延迟线，避免挂起→恢复瞬间的状态突变产生爆音。
 * 同时对已注册的 seekDuckNode 做一次极短淡入兜底。
 */
export const resetXuanAudioEffects = (): void => {
    try { if (cppEngine) cppEngine.resetState(); } catch { /* noop */ }
    try { if (workletNode) workletNode.port.postMessage({ type: 'reset' }); } catch { /* noop */ }
    try {
        if (seekDuckNode) {
            const ctx = seekDuckNode.context;
            const now = ctx.currentTime;
            const g = seekDuckNode.gain;
            g.cancelScheduledValues(now);
            g.setValueAtTime(0.0001, now);
            g.linearRampToValueAtTime(1, now + 0.06);
        }
    } catch { /* noop */ }
};

/** 初始化 C++ 引擎（替代旧的系统均衡器探测），index.tsx 启动时调用。 */
export const initSystemEqualizer = async (): Promise<boolean> => {
    if (cppEngine) return true;
    const engine = await getXuanCppEngine();
    if (!engine) return false;
    cppEngine = engine;
    engine.init(cppSampleRate);
    engineSampleRate = cppSampleRate;
    applySettings();
    return true;
};

/** 兼容旧调用点（useSettingsUiStore 设置变更时触发）：把状态推给 C++ 引擎。 */
export const pushSystemEqualizer = (settings?: XuanAudioEffectSettings): void => {
    if (!cppEngine) {
        void getXuanCppEngine().then(engine => {
            if (!engine) return;
            cppEngine = engine;
            engine.init(cppSampleRate);
            engineSampleRate = cppSampleRate;
            applySettings(settings);
        });
        return;
    }
    applySettings(settings);
};

if (typeof window !== 'undefined') {
    window.addEventListener(XUAN_EFFECT_CHANGE_EVENT, (event: Event) => {
        applySettings((event as CustomEvent<XuanAudioEffectSettings>).detail);
    });
    window.addEventListener('xuan:server-config', () => applySettings());

    // 切回前台：清空 DSP 状态 + 短淡入，消除「从其他软件返回时的爆音」。
    // 只在 hidden→visible 的瞬间触发一次，避免可视状态下重复重置。
    let resumeScheduled = false;
    const onForeground = () => {
        if (resumeScheduled) return;
        resumeScheduled = true;
        // 稍作延迟，等 AudioContext 真正 resume 后再清状态，避免与恢复竞态
        window.setTimeout(() => {
            resumeScheduled = false;
            resetXuanAudioEffects();
        }, 80);
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') onForeground();
    });
    window.addEventListener('xuan:app-resume', onForeground);
    window.addEventListener('focus', onForeground);
}

/**
 * AudioWorklet 泵源码（音频线程运行，独立 WASM 实例）。
 * DSP 全部在音频回调里完成，主线程卡顿（GC / 渲染 / 解码）不再造成缺帧爆音。
 * 通过 Blob URL 加载，无需额外静态文件，两端（Android WebView / Electron）行为一致。
 */
const WORKLET_SRC = `
class XuanPump extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ex = null;
    this.pcmL = null;
    this.pcmR = null;
    this.pendingState = null;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'wasm') {
        WebAssembly.instantiate(d.bytes, {}).then((r) => {
          const ex = r.instance && r.instance.exports;
          if (!ex || !ex.xe_process) return;
          this.ex = ex;
          this.pcmL = new Float32Array(ex.memory.buffer, ex.xe_pcm_l_ptr(), 2048);
          this.pcmR = new Float32Array(ex.memory.buffer, ex.xe_pcm_r_ptr(), 2048);
          ex.xe_init(sampleRate || 44100);
          if (this.pendingState) {
            ex.xe_set_state(this.pendingState.enabled ? 1 : 0, this.pendingState.presetIndex);
            this.pendingState = null;
          }
          this.port.postMessage({ type: 'ready' });
        }).catch(() => { this.ex = null; });
      } else if (d.type === 'state') {
        if (this.ex) this.ex.xe_set_state(d.enabled ? 1 : 0, d.presetIndex);
        else this.pendingState = { enabled: d.enabled, presetIndex: d.presetIndex };
      } else if (d.type === 'reset') {
        if (this.ex && this.ex.xe_reset_state) this.ex.xe_reset_state();
      }
    };
  }
  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || !output.length) return true;
    const outL = output[0];
    const outR = output.length > 1 ? output[1] : outL;
    const input = inputs[0];
    const ex = this.ex;
    if (!ex || !input || !input.length || !input[0]) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      return true;
    }
    const inL = input[0];
    const inR = input.length > 1 && input[1] ? input[1] : inL;
    const n = Math.min(inL.length, 2048);
    this.pcmL.set(inL.subarray(0, n));
    this.pcmR.set(inR.subarray(0, n));
    ex.xe_process(n);
    outL.set(this.pcmL.subarray(0, n));
    if (outR !== outL) outR.set(this.pcmR.subarray(0, n));
    return true;
  }
}
registerProcessor('xuan-pump', XuanPump);
`;

let workletUrl: string | null = null;
let wasmBytesCache: Uint8Array | null = null;
const getWorkletUrl = (): string => {
    if (!workletUrl) {
        workletUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
    }
    return workletUrl;
};
const getWasmBytes = (): Uint8Array | null => {
    if (!wasmBytesCache) {
        try {
            const bin = atob(XUAN_ENGINE_WASM_BASE64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            wasmBytesCache = bytes;
        } catch { return null; }
    }
    return wasmBytesCache;
};

/**
 * 把 C++ 音效引擎插入音频链，返回应连接到 source 的输入节点。
 * 优先 AudioWorklet（音频线程 DSP，主线程卡顿不影响播放，彻底消除杂音）；
 * 不支持时回退 ScriptProcessorNode。引擎未就绪阶段 bit-transparent 直通。
 */
export const attachXuanAudioEffects = (ctx: AudioContext, downstream: AudioNode): AudioNode => {
    activeContext = ctx;
    cppSampleRate = ctx.sampleRate || 44100;
    workletNode = null;

    const input = ctx.createGain();
    input.gain.value = 1;

    let processor: ScriptProcessorNode | null = null;
    try {
        // bufferSize 与 C++ MAX_FRAMES(=2048) 对齐；双声道输入输出。
        processor = ctx.createScriptProcessor(2048, 2, 2);
    } catch {
        // 极老 WebView 兜底：不做处理，直接连通。
        input.connect(downstream);
        return input;
    }

    input.connect(processor);
    processor.connect(downstream);

    // 主线程引擎：仅供播放器页渲染（visualizer）使用；按真实采样率补 init。
    if (!cppEngine) {
        void getXuanCppEngine().then(engine => {
            if (!engine) return;
            cppEngine = engine;
            if (engineSampleRate !== cppSampleRate) {
                engine.init(cppSampleRate);
                engineSampleRate = cppSampleRate;
            }
            applySettings();
        });
    } else if (engineSampleRate !== cppSampleRate) {
        cppEngine.init(cppSampleRate);
        engineSampleRate = cppSampleRate;
        applySettings();
    }

    processor.onaudioprocess = (ev: AudioProcessingEvent) => {
        const inBuf = ev.inputBuffer;
        const outBuf = ev.outputBuffer;
        const n = Math.min(inBuf.length, 2048);
        const inL = inBuf.getChannelData(0);
        const inR = inBuf.numberOfChannels > 1 ? inBuf.getChannelData(1) : inL;
        const outL = outBuf.getChannelData(0);
        const outR = outBuf.numberOfChannels > 1 ? outBuf.getChannelData(1) : outL;

        const eng = cppEngine;
        if (!eng) {
            // 引擎未就绪：bit-transparent 直通
            outL.set(inL.subarray(0, n));
            if (inR !== inL || outR !== outL) outR.set(inR.subarray(0, n));
            return;
        }

        eng.pcmL.set(inL.subarray(0, n));
        eng.pcmR.set(inR.subarray(0, n));
        eng.process(n);
        outL.set(eng.pcmL.subarray(0, n));
        if (outR !== outL) outR.set(eng.pcmR.subarray(0, n));
    };

    // 升级到 AudioWorklet：wasm 实例化完成后（ready）再换线，避免静音间隙。
    void (async () => {
        try {
            if (!ctx.audioWorklet) return;
            const bytes = getWasmBytes();
            if (!bytes) return;
            await ctx.audioWorklet.addModule(getWorkletUrl());
            const node = new AudioWorkletNode(ctx, 'xuan-pump', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2],
            });
            node.port.onmessage = (e: MessageEvent) => {
                if ((e.data as { type?: string })?.type !== 'ready') return;
                if (workletNode !== node) return;
                try {
                    input.disconnect(processor);
                    processor!.onaudioprocess = null;
                    processor!.disconnect();
                } catch { /* noop */ }
                input.connect(node);
                node.connect(downstream);
            };
            node.port.postMessage({ type: 'wasm', bytes });
            const s = readXuanAudioEffects();
            const on = s.enabled && s.preset !== 'off';
            node.port.postMessage({
                type: 'state',
                enabled: on,
                presetIndex: XUAN_CPP_PRESET_INDEX[on ? s.preset : 'off'] ?? 0,
            });
            workletNode = node;
        } catch (err) {
            console.warn('[XuanAudio] AudioWorklet 不可用，保持 ScriptProcessor 兜底', err);
        }
    })();

    return input;
};

export const registerSeekDuckNode = (node: GainNode | null): void => { seekDuckNode = node; };

if (typeof window !== 'undefined') {
    window.addEventListener('xuan:audio-pre-seek', () => {
        if (!seekDuckNode) return;
        try {
            const ctx = seekDuckNode.context;
            const now = ctx.currentTime;
            const g = seekDuckNode.gain;
            g.cancelScheduledValues(now);
            g.setValueAtTime(g.value, now);
            g.linearRampToValueAtTime(0.0001, now + 0.010);
            g.linearRampToValueAtTime(1, now + 0.18);
        } catch { /* noop */ }
    });
}

/** 当前生效的预设（供诊断 / UI 使用）。 */
export const currentAppliedPreset = (): XuanEffectPreset => appliedPreset;

/** 供播放器页渲染组件复用同一个 C++ 引擎实例。 */
export const getXuanCppEngineForRender = () => getXuanCppEngine();
