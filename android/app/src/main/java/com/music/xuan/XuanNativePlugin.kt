package com.music.xuan

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.Virtualizer
import com.getcapacitor.JSArray
import java.io.File
import java.io.FileOutputStream

/**
 * 小轩音乐原生能力：
 *  - 常驻媒体通知（XuanMediaService 前台服务承载）：App 活着就显示，完全清后台才消失；
 *    MediaSession 提供锁屏媒体卡片，含播放/暂停/上一首/下一首/收藏
 *  - 在线更新：保存 APK 到私有目录并通过 FileProvider 交给系统安装器覆盖安装
 *
 * 通知按钮通过广播 → 插件 → JS 事件 mediaAction 回传给前端统一处理。
 */
@CapacitorPlugin(
    name = "XuanNative",
    permissions = [Permission(strings = [android.Manifest.permission.POST_NOTIFICATIONS])]
)
class XuanNativePlugin : Plugin() {

    companion object {
        const val CHANNEL_ID = "xuan_media"
        const val NOTI_ID = 20261108
        const val ACTION_PREFIX = "com.music.xuan.MEDIA_"
        const val EXTRA_ACTION = "xuan_action"
        private val ACTIONS = arrayOf("play", "pause", "prev", "next", "like")
    }

    private var receiver: BroadcastReceiver? = null
    private var registered = false

    // 系统均衡器：全局音频会话（session 0）上的 Android 原生音效，
    // 前端 7 种预设全部映射到这里，Web Audio 链在原生可用时整体旁路。
    private var sysEq: Equalizer? = null
    private var sysBass: BassBoost? = null
    private var sysVirtual: Virtualizer? = null
    private val sysSession = 0

    override fun load() {
        val filter = IntentFilter().apply { ACTIONS.forEach { addAction(ACTION_PREFIX + it) } }
        receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                val action = intent?.action?.removePrefix(ACTION_PREFIX) ?: return
                val data = JSObject().apply { put("action", action) }
                notifyListeners("mediaAction", data, true)
            }
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                context.registerReceiver(receiver, filter)
            }
            registered = true
        } catch (_: Exception) { }
        createChannel()
        // App 一打开就常驻媒体通知（未播放显示待机态），完全清后台才消失
        pushService("小轩音乐", "未在播放", false, null, false, false)
    }

    override fun handleOnDestroy() {
        if (registered) { try { context.unregisterReceiver(receiver) } catch (_: Exception) { } }
        try { sysEq?.release(); sysBass?.release(); sysVirtual?.release() } catch (_: Throwable) { }
        sysEq = null; sysBass = null; sysVirtual = null
        super.handleOnDestroy()
    }

    /** 懒加载系统音效；三个效果分别容错，任一不可用不影响其余。 */
    private fun ensureSystemEq() {
        if (sysEq != null) return
        // session 0 = 全局输出混音：这是 WebView 音频唯一稳定可取的系统级会话，
        // 需 Manifest 声明 MODIFY_AUDIO_SETTINGS（normal 权限，无需动态申请）。
        try { sysEq = Equalizer(0, sysSession); sysEq?.enabled = true } catch (_: Throwable) { sysEq = null }
        try { sysBass = BassBoost(0, sysSession); sysBass?.enabled = true } catch (_: Throwable) { sysBass = null }
        try { sysVirtual = Virtualizer(0, sysSession); sysVirtual?.enabled = true } catch (_: Throwable) { sysVirtual = null }
    }

    /** 前端探测系统均衡器能力（频段数 / 增益范围，millibels）。 */
    @PluginMethod
    fun getSystemEqStatus(call: PluginCall) {
        try {
            ensureSystemEq()
            val eq = sysEq
            if (eq == null) {
                call.resolve(JSObject().apply {
                    put("available", false); put("bands", 0); put("min", 0); put("max", 0)
                })
                return
            }
            val range = eq.bandLevelRange
            val freqs = JSArray()
            for (i in 0 until eq.numberOfBands.toInt()) {
                freqs.put(eq.getCenterFreq(i.toShort()) / 1000)
            }
            call.resolve(JSObject().apply {
                put("available", true)
                put("bands", eq.numberOfBands.toInt())
                put("min", range[0].toInt())
                put("max", range[1].toInt())
                put("bandFreqs", freqs)
            })
        } catch (_: Throwable) {
            call.resolve(JSObject().apply {
                put("available", false); put("bands", 0); put("min", 0); put("max", 0)
            })
        }
    }

    /**
     * 应用音效预设到系统均衡器。
     * enabled 恒为 true：即使「关闭音效」也调用系统 EQ（全部频段 = 0，flat），
     * 满足「登录/未登录、有音效/无音效都调用系统均衡器」。
     */
    @PluginMethod
    fun applySystemEqualizer(call: PluginCall) {
        val arr: JSArray? = try { call.getArray("bands") } catch (_: Throwable) { null }
        val bass = call.getInt("bass") ?: 0
        val virtual = call.getInt("virtual") ?: 0
        try {
            ensureSystemEq()
            val eq = sysEq
            if (eq == null) {
                call.resolve(JSObject().apply { put("ok", false) })
                return
            }
            val range = eq.bandLevelRange
            val count = minOf(arr?.length() ?: 0, eq.numberOfBands.toInt())
            for (i in 0 until count) {
                val raw = arr?.optInt(i, 0) ?: 0
                val level = raw.coerceIn(range[0].toInt(), range[1].toInt()).toShort()
                eq.setBandLevel(i.toShort(), level)
            }
            try {
                sysBass?.setStrength(bass.coerceIn(0, 1000).toShort())
                sysBass?.enabled = true
            } catch (_: Throwable) { }
            try {
                sysVirtual?.setStrength(virtual.coerceIn(0, 1000).toShort())
                sysVirtual?.enabled = true
            } catch (_: Throwable) { }
            eq.enabled = true
            call.resolve(JSObject().apply { put("ok", true) })
        } catch (e: Exception) {
            call.reject("system eq failed: ${e.message}")
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val ch = NotificationChannel(CHANNEL_ID, "小轩音乐播放控制", NotificationManager.IMPORTANCE_LOW).apply {
                description = "播放、切歌与收藏控制"
                setShowBadge(false)
                lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
            }
            mgr.createNotificationChannel(ch)
        }
    }

    private fun pending(action: String): PendingIntent {
        val i = Intent(ACTION_PREFIX + action).setPackage(context.packageName)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        return PendingIntent.getBroadcast(context, action.hashCode(), i, flags)
    }

    private fun icon(name: String): Int {
        val id = context.resources.getIdentifier(name, "drawable", context.packageName)
        return if (id != 0) id else android.R.drawable.ic_media_play
    }

    /** 启动/刷新常驻媒体通知（前台服务 XuanMediaService 承载） */
    private fun pushService(title: String?, artist: String?, playing: Boolean, cover: String?, showFav: Boolean, liked: Boolean) {
        val i = Intent(context, XuanMediaService::class.java)
            .setAction(XuanMediaService.ACTION_UPDATE)
            .putExtra(XuanMediaService.EXTRA_TITLE, title ?: "小轩音乐")
            .putExtra(XuanMediaService.EXTRA_ARTIST, artist ?: "")
            .putExtra(XuanMediaService.EXTRA_PLAYING, playing)
            .putExtra(XuanMediaService.EXTRA_COVER, cover)
            .putExtra(XuanMediaService.EXTRA_SHOW_FAV, showFav)
            .putExtra(XuanMediaService.EXTRA_LIKED, liked)
        try {
            ContextCompat.startForegroundService(context, i)
        } catch (_: Throwable) { }
    }

    /** 更新常驻媒体通知：App 活着就显示（听不听歌都在），清后台由服务 onTaskRemoved 移除 */
    @PluginMethod
    fun updateMedia(call: PluginCall) {
        pushService(
            call.getString("title"),
            call.getString("artist"),
            call.getBoolean("playing") ?: false,
            call.getString("cover"),
            call.getBoolean("showFavorite") ?: false,
            call.getBoolean("liked") ?: false,
        )
        call.resolve()
    }

    @PluginMethod
    fun hideMedia(call: PluginCall) {
        try {
            context.startService(
                Intent(context, XuanMediaService::class.java).setAction(XuanMediaService.ACTION_STOP)
            )
        } catch (_: Throwable) { }
        call.resolve()
    }

    /** 把下载好的 APK 写入应用私有目录，返回可供安装的文件路径 */
    @PluginMethod
    fun saveApk(call: PluginCall) {
        val b64 = call.getString("base64")
        val name = call.getString("name") ?: "xuan-update.apk"
        if (b64.isNullOrEmpty()) { call.reject("empty apk"); return }
        try {
            val dir = File(context.filesDir, "updates").apply { mkdirs() }
            val file = File(dir, name)
            FileOutputStream(file).use { it.write(Base64.decode(b64, Base64.DEFAULT)) }
            call.resolve(JSObject().apply { put("path", file.absolutePath) })
        } catch (e: Exception) {
            call.reject("save failed: ${e.message}")
        }
    }

    /** 通过 FileProvider + ACTION_VIEW 调起系统安装器；同包名同签名 → 直接覆盖升级 */
    @PluginMethod
    fun installApk(call: PluginCall) {
        val path = call.getString("path")
        if (path.isNullOrEmpty()) { call.reject("missing path"); return }
        val file = File(path)
        if (!file.exists() || file.length() < 1024 * 1024) { call.reject("invalid apk"); return }
        try {
            val uri: Uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            call.resolve(JSObject().apply { put("ok", true) })
        } catch (e: Exception) {
            call.reject("install failed: ${e.message}")
        }
    }

    /** 返回 APK 真实版本号（PackageManager 读取，非构建注入）：更新比对以它为准 */
    @PluginMethod
    fun getApkVersion(call: PluginCall) {
        try {
            val pi = context.packageManager.getPackageInfo(context.packageName, 0)
            call.resolve(JSObject().apply {
                put("versionCode", if (android.os.Build.VERSION.SDK_INT >= 28) pi.longVersionCode.toInt() else pi.versionCode)
                put("versionName", pi.versionName ?: "")
            })
        } catch (e: Exception) {
            call.reject("version failed: ${e.message}")
        }
    }

    /** 设备支持的帧率档位（取整去重升序，如 [30, 60, 90, 120]） */
    @PluginMethod
    fun getSupportedFrameRates(call: PluginCall) {
        val rates = supportedFrameRates()
        call.resolve(JSObject().apply { put("rates", com.getcapacitor.JSArray.from(rates)) })
    }

    /** 设置目标帧率：选择 ≥ 目标且最接近的支持档；找不到则选最接近的档 */
    @PluginMethod
    fun setFrameRate(call: PluginCall) {
        val target = (call.getInt("fps") ?: 0).toFloat()
        val activity = bridge?.activity ?: run { call.reject("no activity"); return }
        try {
            val display = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) activity.display
            else @Suppress("DEPRECATION") activity.windowManager.defaultDisplay
            if (display == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                call.reject("unsupported"); return
            }
            val current = display.mode
            val candidates = display.supportedModes.filter {
                it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight
            }
            if (candidates.isEmpty()) { call.reject("no modes"); return }
            val chosen = candidates.minByOrNull {
                val diff = it.refreshRate - target
                (if (diff >= -0.5f) diff else 1e6f + kotlin.math.abs(diff)) // 优先 ≥target，其次最接近
            } ?: candidates.first()
            val lp = activity.window.attributes
            lp.preferredDisplayModeId = chosen.modeId
            activity.window.attributes = lp
            call.resolve(JSObject().apply { put("fps", Math.round(chosen.refreshRate)) })
        } catch (e: Exception) {
            call.reject("set failed: ${e.message}")
        }
    }

    private fun supportedFrameRates(): List<Int> {
        val activity = bridge?.activity ?: return emptyList()
        return try {
            val display = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) activity.display
            else @Suppress("DEPRECATION") activity.windowManager.defaultDisplay
            val current = display?.mode
            (display?.supportedModes ?: emptyArray())
                .filter { current == null || (it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight) }
                .map { Math.round(it.refreshRate) }
                .distinct()
                .sorted()
        } catch (_: Exception) { emptyList() }
    }
}
