import ncaeRaw from './ncaePresets.json';
import { getXuanCppEngine, XUAN_CPP_PRESET_INDEX, type XuanCppEngine } from './wasm/xuanEngine';

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
let appliedPreset: XuanEffectPreset = 'off';
let activeContext: AudioContext | null = null;
let seekDuckNode: GainNode | null = null;

/** 把当前设置推送给 C++ 引擎。音效关闭时 C++ 仍保留常驻隐藏超重低音层。 */
const applySettings = (settings?: XuanAudioEffectSettings): void => {
    const s = settings || readXuanAudioEffects();
    const presetId: XuanEffectPreset = s.enabled && s.preset !== 'off' ? s.preset : 'off';
    appliedPreset = presetId;
    if (cppEngine) {
        cppEngine.setState(s.enabled && s.preset !== 'off', XUAN_CPP_PRESET_INDEX[presetId] ?? 0);
    }
    if (activeContext && activeContext.state === 'suspended') {
        void activeContext.resume().catch(() => { });
    }
};

/** 初始化 C++ 引擎（替代旧的系统均衡器探测），index.tsx 启动时调用。 */
export const initSystemEqualizer = async (): Promise<boolean> => {
    if (cppEngine) return true;
    const engine = await getXuanCppEngine();
    if (!engine) return false;
    cppEngine = engine;
    engine.init(cppSampleRate);
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
}

/**
 * 把 C++ 音效引擎插入音频链，返回应连接到 source 的输入节点。
 * 用 ScriptProcessorNode 逐帧把 PCM 送进 WASM，DSP 全部在 C++ 完成。
 * 引擎未就绪时 bit-transparent 直通，绝不影响播放。
 */
export const attachXuanAudioEffects = (ctx: AudioContext, downstream: AudioNode): AudioNode => {
    activeContext = ctx;
    cppSampleRate = ctx.sampleRate || 44100;

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

    // 引擎异步加载：就绪后按真实采样率 init 并应用当前设置。
    if (!cppEngine) {
        void getXuanCppEngine().then(engine => {
            if (!engine) return;
            cppEngine = engine;
            engine.init(cppSampleRate);
            applySettings();
        });
    } else {
        cppEngine.init(cppSampleRate);
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
