import React, { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { getXuanCppEngine, type XuanCppEngine } from '../../services/wasm/xuanEngine';

/**
 * 小轩音乐 · 播放器页 C++ 渲染层
 * --------------------------------------------------------------------
 * 「正在播放」页的频谱柱 / 波形 / 光晕 / 粒子的每一个像素，均由 C++
 * (src/cpp/xuan_engine.cpp → xe_render) 写入 RGBA 帧缓冲，这里只负责：
 *   1) 从 AnalyserNode 取频谱，灌进 WASM 的 spec 缓冲；
 *   2) 调 C++ xe_render 生成一帧；
 *   3) putImageData 到 Canvas。
 * 移动端(Android WebView)与桌面端(Electron)共用同一份 WASM，画面一致。
 * 引擎未就绪时不绘制，绝不影响播放页其它内容（pointer-events:none）。
 */
type Props = {
    analyserRef: RefObject<AnalyserNode | null>;
};

const BANDS = 64;

const XuanCppVisualizer: React.FC<Props> = ({ analyserRef }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        let disposed = false;
        let engine: XuanCppEngine | null = null;
        let raf = 0;
        let freqData: Uint8Array<ArrayBuffer> | null = null;
        let lastBins = 0;
        // 每帧复用同一份 RGBA 缓冲：此前每帧 new 518KB，60fps 下每秒 31MB 垃圾，
        // 主线程 GC 会挤占 ScriptProcessorNode 的音频时隙，造成周期性咔哒杂音。
        let frameBuf: Uint8ClampedArray | null = null;
        let imageData: ImageData | null = null;
        // 渲染节流：30fps 起步；设备跑不动时自适应降到 20/15fps，保播放优先。
        let frameInterval = 1000 / 30;
        let lastRender = 0;
        let slowStreak = 0;

        getXuanCppEngine().then(e => { if (!disposed) engine = e; });

        const loop = (nowMs: number) => {
            raf = requestAnimationFrame(loop);
            if (document.hidden || disposed) return;
            if (nowMs - lastRender < frameInterval) return;
            const renderStart = nowMs;
            lastRender = nowMs;
            const canvas = canvasRef.current;
            if (!canvas || !engine) return;
            const eng = engine as XuanCppEngine;
            const w = eng.frameW, h = eng.frameH;
            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // 1) 频谱：对数分桶把 AnalyserNode 频率数据降采样到 64 段，写入 WASM 内存
            const an = analyserRef.current;
            if (an) {
                const bins = an.frequencyBinCount;
                if (!freqData || lastBins !== bins) {
                    freqData = new Uint8Array(new ArrayBuffer(bins));
                    lastBins = bins;
                }
                an.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>);
                for (let k = 0; k < BANDS; k++) {
                    const i0 = Math.floor(Math.pow(k / BANDS, 2) * bins);
                    const i1 = Math.max(i0 + 1, Math.floor(Math.pow((k + 1) / BANDS, 2) * bins));
                    let m = 0;
                    for (let i = i0; i < i1 && i < bins; i++) {
                        const v = freqData[i];
                        if (v > m) m = v;
                    }
                    eng.spec[k] = m / 255;
                }
            } else {
                for (let k = 0; k < BANDS; k++) eng.spec[k] = 0;
            }

            // 2) C++ 生成一帧 RGBA
            eng.render(w, h, nowMs / 1000, BANDS);

            // 3) 呈现（拷进复用缓冲，避免每帧分配；putImageData 同步拷贝后即可复用）
            if (!frameBuf || frameBuf.length !== eng.frame.length) {
                frameBuf = new Uint8ClampedArray(eng.frame.length);
                imageData = ctx.createImageData(w, h);
            }
            frameBuf.set(eng.frame);
            if (imageData) {
                imageData.data.set(frameBuf);
                ctx.putImageData(imageData, 0, 0);
            }

            // 自适应帧率：连续多帧超时则降档（30 -> 20 -> 15fps）
            const cost = performance.now() - renderStart;
            if (cost > frameInterval * 0.8) {
                slowStreak++;
                if (slowStreak >= 20) {
                    slowStreak = 0;
                    if (frameInterval < 1000 / 15) frameInterval = 1000 / 20;
                    else frameInterval = 1000 / 15;
                }
            } else {
                slowStreak = 0;
            }
        };
        raf = requestAnimationFrame(loop);
        return () => { disposed = true; cancelAnimationFrame(raf); };
    }, [analyserRef]);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            style={{
                position: 'fixed',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 1,
                opacity: 0.28,
                mixBlendMode: 'screen',
            }}
        />
    );
};

export default XuanCppVisualizer;
