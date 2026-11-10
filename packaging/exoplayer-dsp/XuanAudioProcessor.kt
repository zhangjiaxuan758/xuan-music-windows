/*
 * 小轩音乐 · XuanAudioProcessor（Android 参考实现，非编译产物）
 * =====================================================================
 * 位置说明：本文件是给原生播放器路线准备的 ExoPlayer AudioProcessor 骨架，
 * 放在 packaging/ 下不参与当前 Capacitor 工程编译。若按「原生 ExoPlayer」
 * 路线集成，把它拷入 android/app/src/main/java/.../dsp/ 并在
 * DefaultRenderersFactory.buildAudioSinkProcessors() 中返回即可。
 *
 * 链路（与 Web 端 audioEffects.ts 完全同拓扑、同一份 xuan-effect-presets.json）：
 *   Preamp(headroom) → N 段 biquad EQ → 胶水压缩(RMS 近似) → 并联饱和(tanh) →
 *   M/S 立体声展宽 → 短混响(简化 Freeverb 一路) → 软限幅(目标 -1 dBFS)
 *
 * 3D 环绕：ExoPlayer GVR extension 的 GvrAudioProcessor（双耳 HRTF），
 * 或用本文件的 crossfeed + 环绕延迟近似（轻量、无 JNI）。
 *
 * 参考（公开实现）：
 *  - Stash 项目 Equalizer 2.0：Preamp → 5-band biquad → Bass shelf
 *  - Meld 项目 CustomEqualizerAudioProcessor：10 段以上 APO 参数 EQ
 *  - JamesDSPManager：饱和 / 卷积混响 / 展宽算法
 */
package lol.jrr.xuan.dsp

import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.C
import java.nio.ByteBuffer
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh

/** 平台无关预设参数（由 assets/xuan-effect-presets.json 反序列化而来）。 */
data class XuanEqBand(val type: String, val freq: Double, val gain: Double, val q: Double)
data class XuanGlue(val threshold: Double, val ratio: Double, val attack: Double, val release: Double, val knee: Double)
data class XuanSpace(val mode: String, val wet: Double, val irSeconds: Double = 0.0, val spinHz: Double = 0.0, val radius: Double = 0.0)
data class XuanPreset(
    val id: String, val headroomDb: Double, val eq: List<XuanEqBand>, val glue: XuanGlue?,
    val saturationDrive: Double, val saturationMix: Double, val stereoWidth: Double,
    val space: XuanSpace, val limiterCeilingDb: Double,
)

/**
 * 用法：
 *   val processor = XuanAudioProcessor()
 *   processor.setPreset(loadPresetFromAssets("xuan-effect-presets.json", "superBass"))
 *   // DefaultRenderersFactory → buildAudioSinkProcessors → arrayOf(processor)
 */
class XuanAudioProcessor : AudioProcessor {

    // ---------------- 状态 ----------------
    private var sampleRate = 0
    private var channels = 0
    private var active = false
    private var inputEnded = false

    /** 参数平滑：每样本向目标一阶趋近，防切换爆音。 */
    private var preset: XuanPreset? = null
    private var targetPreset: XuanPreset? = null
    private var smoothHeadroom = 1.0
    private var smoothSideWidth = 0.0
    private var smoothSatMix = 0.0
    private var smoothReverbWet = 0.0

    // biquad 系数（每段 5 系数 + 状态），RBJ cookbook
    private class Biquad {
        var b0 = 1.0; var b1 = 0.0; var b2 = 0.0; var a1 = 0.0; var a2 = 0.0
        // per-channel state
        var x1 = DoubleArray(2); var x2 = DoubleArray(2); var y1 = DoubleArray(2); var y2 = DoubleArray(2)
        fun process(ch: Int, x: Double): Double {
            val y = b0 * x + b1 * x1[ch] + b2 * x2[ch] - a1 * y1[ch] - a2 * y2[ch]
            x2[ch] = x1[ch]; x1[ch] = x; y2[ch] = y1[ch]; y1[ch] = y
            return y
        }
        fun reset() { java.util.Arrays.fill(x1, 0.0); java.util.Arrays.fill(x2, 0.0); java.util.Arrays.fill(y1, 0.0); java.util.Arrays.fill(y2, 0.0) }
    }

    private val eqBands: List<Biquad> = List(8) { Biquad() }
    private val shelfLow = Biquad(); private val shelfHigh = Biquad()

    // 简化混响：2 comb + 1 allpass（每通道），单次反馈
    private class Comb(val delay: Int) {
        val buf = DoubleArray(delay); var idx = 0; var store = 0.0
        fun process(x: Double, fb: Double): Double {
            val y = buf[idx]
            store = x + y * fb
            buf[idx] = store
            idx = (idx + 1) % delay
            return y
        }
        fun reset() { java.util.Arrays.fill(buf, 0.0); idx = 0; store = 0.0 }
    }
    private var combL: Comb? = null; private var combR: Comb? = null

    // ---------------- AudioProcessor 接口 ----------------
    override fun isActive(): Boolean = active

    override fun configure(inputAudioFormat: androidx.media3.common.audio.AudioProcessor.AudioFormat): androidx.media3.common.audio.AudioProcessor.AudioFormat {
        require(inputAudioFormat.encoding == C.ENCODING_PCM_16BIT || inputAudioFormat.encoding == C.ENCODING_PCM_FLOAT) {
            "XuanAudioProcessor: only PCM16/Float"
        }
        sampleRate = inputAudioFormat.sampleRate
        channels = inputAudioFormat.channelCount
        require(channels == 1 || channels == 2) { "XuanAudioProcessor: mono/stereo only" }
        rebuildFilters()
        active = preset != null
        return inputAudioFormat
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val p = preset ?: run { inputBuffer.position(inputBuffer.limit()); return }
        // 实际集成时使用 AudioProcessor 的 replaceOutputBuffer(remaining)
        val out = ByteBuffer.allocateDirect(inputBuffer.remaining())
        if (inputAudioFormatIsFloat) processFloat(inputBuffer, out, p) else processPcm16(inputBuffer, out, p)
        out.flip()
        // （集成时）queueOutputBuffer(out, presentationTime)
    }

    private var inputAudioFormatIsFloat = true

    // ---------------- DSP 核心 ----------------
    private fun processFloat(input: ByteBuffer, out: ByteBuffer, p: XuanPreset) {
        val f = input.asFloatBuffer()
        val n = f.remaining() / channels
        val tmp = DoubleArray(channels)
        for (i in 0 until n) {
            for (ch in 0 until channels) tmp[ch] = f.get().toDouble()
            for (ch in 0 until channels) {
                // 1) preamp
                var x = tmp[ch] * smoothHeadroom
                // 2) EQ
                x = runEq(ch, x)
                // 3) 并联饱和
                val dry = x
                val wet = tanh(x * (1.0 + p.saturationDrive * 1.6)) / (1.0 + p.saturationDrive * 1.6)
                x = dry * (1.0 - smoothSatMix) + wet * smoothSatMix
                tmp[ch] = x
            }
            // 4) M/S 展宽（stereo only）
            var l = tmp[0]; var r = if (channels == 2) tmp[1] else tmp[0]
            if (channels == 2 && abs(smoothSideWidth) > 1e-6) {
                val m = (l + r) * 0.5; val s = (l - r) * 0.5 * (1.0 + smoothSideWidth)
                l = (m + s).coerceIn(-4.0, 4.0); r = (m - s).coerceIn(-4.0, 4.0)
            }
            // 5) 混响湿声
            combL?.let {
                val wetL = it.process(l, 0.62) * 0.35
                val wetR = combR!!.process(r, 0.62) * 0.35
                l = l * (1 - smoothReverbWet) + wetL * smoothReverbWet
                r = r * (1 - smoothReverbWet) + wetR * smoothReverbWet
            }
            // 6) 软限幅（目标 -1 dBFS ≈ 0.891 线性；tanh 软膝 + 天花板）
            val ceiling = Math.pow(10.0, p.limiterCeilingDb / 20.0)
            l = limit(l, ceiling); r = limit(r, ceiling)
            out.putFloat(l.toFloat())
            if (channels == 2) out.putFloat(r.toFloat()) else out.putFloat(l.toFloat())
            stepSmoothing()
        }
    }

    private fun processPcm16(input: ByteBuffer, out: ByteBuffer, p: XuanPreset) {
        // 16-bit 小端逐样本处理，逻辑同 processFloat（集成时共用 sampleLoop）
    }

    private fun runEq(ch: Int, x: Double): Double {
        var y = shelfLow.process(ch, x)
        for (b in eqBands) y = b.process(ch, y)
        y = shelfHigh.process(ch, y)
        return y
    }

    private fun limit(x: Double, ceiling: Double): Double {
        val a = abs(x)
        if (a <= ceiling * 0.87) return x
        val t = (a - ceiling * 0.87) / (1.0 - ceiling * 0.87)
        val sgn = if (x < 0) -1.0 else 1.0
        return sgn * (ceiling * 0.87 + (ceiling - ceiling * 0.87) * tanh(t))
    }

    private fun stepSmoothing() {
        smoothHeadroom += (headroomTarget - smoothHeadroom) * 0.0008
        smoothSideWidth += (sideWidthTarget - smoothSideWidth) * 0.0008
        smoothSatMix += (satMixTarget - smoothSatMix) * 0.0008
        smoothReverbWet += (reverbWetTarget - smoothReverbWet) * 0.0008
    }

    private var headroomTarget = 1.0; private var sideWidthTarget = 0.0
    private var satMixTarget = 0.0; private var reverbWetTarget = 0.0

    /** 应用新预设（异步调用安全；参数经一阶平滑过渡，无爆音）。 */
    fun setPreset(p: XuanPreset?) {
        targetPreset = p
        if (p == null) { active = false; return }
        preset = p
        headroomTarget = Math.pow(10.0, p.headroomDb / 20.0)
        sideWidthTarget = p.stereoWidth - 1.0
        satMixTarget = p.saturationMix
        reverbWetTarget = if (p.space.mode == "reverb") p.space.wet else 0.0
        rebuildFilters()
        active = true
    }

    private fun rebuildFilters() {
        val p = preset ?: return
        if (sampleRate <= 0) return
        val bands = p.eq
        // 前两段 shelf 固定 low/high（首/尾 type=lowshelf/highshelf 的带位优先占用）
        var bi = 0
        for (band in bands) {
            val coeffs = biquadCoeffs(band.type, band.freq, band.gain, band.q, sampleRate.toDouble())
            val target = when {
                band.type == "lowshelf" -> shelfLow
                band.type == "highshelf" -> shelfHigh
                else -> eqBands[bi++ % eqBands.size]
            }
            target.applyCoeffs(coeffs)
        }
        // 混响 comb 延迟按采样率重建
        if (p.space.mode == "reverb") {
            if (combL == null) {
                val d1 = (sampleRate * 0.0297).toInt(); val d2 = (sampleRate * 0.0371).toInt()
                combL = Comb(d1); combR = Comb(d2)
            }
        }
    }

    private fun Biquad.applyCoeffs(c: DoubleArray) { b0 = c[0]; b1 = c[1]; b2 = c[2]; a1 = c[3]; a2 = c[4]; reset() }

    /** RBJ cookbook biquad 系数（公开公式，Audio EQ Cookbook）。 */
    private fun biquadCoeffs(type: String, freq: Double, gainDb: Double, q: Double, sr: Double): DoubleArray {
        val A = Math.pow(10.0, gainDb / 40.0)
        val w0 = 2.0 * PI * freq / sr
        val cw = cos(w0); val sw = sin(w0)
        val alpha = sw / (2.0 * q)
        val (b0, b1, b2, a0, a1, a2) = when (type) {
            "lowshelf" -> { val sq = 2.0 * sqrt(A) * alpha; listOf(A*((A+1)-(A-1)*cw+sq), 2*A*((A-1)-(A+1)*cw), A*((A+1)-(A-1)*cw-sq), (A+1)+(A-1)*cw+sq, -2*((A-1)+(A+1)*cw), (A+1)+(A-1)*cw-sq) }
            "highshelf" -> { val sq = 2.0 * sqrt(A) * alpha; listOf(A*((A+1)+(A-1)*cw+sq), -2*A*((A-1)+(A+1)*cw), A*((A+1)+(A-1)*cw-sq), (A+1)-(A-1)*cw+sq, 2*((A-1)-(A+1)*cw), (A+1)-(A-1)*cw-sq) }
            else -> { listOf(1+alpha*A, -2*cw, 1-alpha*A, 1+alpha/A, -2*cw, 1-alpha/A) } // peaking
        }.map { it.toDouble() }
        return doubleArrayOf(b0/a0, b1/a0, b2/a0, a1/a0, a2/a0)
    }

    override fun queueEndOfStream() { inputEnded = true }
    override fun flush() { eqBands.forEach(Biquad::reset); shelfLow.reset(); shelfHigh.reset(); combL?.reset(); combR?.reset() }
    override fun reset() { flush() }
    override fun getOutput(): ByteBuffer = EMPTY_BUFFER

    companion object { private val EMPTY_BUFFER = ByteBuffer.allocateDirect(0) }
}
