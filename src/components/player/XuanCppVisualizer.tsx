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

        getXuanCppEngine().then(e => { if (!disposed) engine = e; });

        const loop = () => {
            raf = requestAnimationFrame(loop);
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
            eng.render(w, h, performance.now() / 1000, BANDS);

            // 3) 呈现（复制一份，避免 WASM 内存视图被 ImageData 直接持有）
            const frame = new Uint8ClampedArray(eng.frame);
            ctx.putImageData(new ImageData(frame, w, h), 0, 0);
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
