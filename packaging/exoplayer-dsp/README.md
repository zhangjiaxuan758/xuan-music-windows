# XuanAudioProcessor · Android 原生 DSP 集成说明

本目录是**参考实现**（不参与 Capacitor 工程编译）。Web/WebView 端的同一份
预设由 `client/src/services/audioEffects.ts`（Web Audio）实时渲染；APK 当前
跑在 Capacitor WebView 上，直接使用 Web Audio 链路（32-bit float 内部处理）。

## 集成步骤（原生 ExoPlayer 路线）

1. `gradle` 引入 `androidx.media3:media3-exoplayer`。
2. 把 `XuanAudioProcessor.kt` 拷入 `android/app/src/main/java/lol/jrr/xuan/dsp/`。
3. `xuan-effect-presets.json` 拷入 `assets/`，运行时反序列化为 `XuanPreset`。
4. 自定义 `DefaultRenderersFactory.buildAudioSinkProcessors()` 返回
   `arrayOf(xuanAudioProcessor)`，播放前 `setPreset(...)`。
5. 预设 id 与网页端一致：superBass / surround3d / panoramic / hdVocal /
   clearVocal / hifiLive / immersive。

## 与系统 AudioEffect 的关系（降级方案）

- 系统方案（Equalizer/BassBoost/Virtualizer/PresetReverb，绑定 audioSessionId）
  实现快但频段/Q 受设备限制，`Virtualizer` 在 API 35 已 deprecated，且与
  共享 JSON 预设无法一一映射 → 只作为**最后兜底**：
  - 当设备 CPU 过弱（Convolver/HRTF 卡顿）时，把 `surround3d/panoramic/…`
    降级为系统 Virtualizer + PresetReverb；
  - 超重低音可映射系统 BassBoost(0..1000) ≈ drive*2500。
- 推荐：优先本 AudioProcessor（手写 biquad/饱和/限幅，成本远低于 WASM 引擎）；
  3D 环绕高配设备可换 ExoPlayer GVR extension 的 `GvrAudioProcessor`（真双耳）。

## 参数平滑

`setPreset()` 只更新 target，样本循环内一阶趋近（≈30~60ms 过渡），
biquad 系数在 `configure()/setPreset()` 时重建并 reset 状态，避免爆音。

## 防削波

- 并联饱和 `tanh(x*k)/k`：小信号单位增益，只压峰不放大。
- 末端软限幅：knee=0.87*ceiling，tanh 软膝，天花板 -1 dBFS。
- 全程 double 运算（内部等效 32-bit float 精度），输出 PCM float/16bit。
