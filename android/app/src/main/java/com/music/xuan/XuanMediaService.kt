package com.music.xuan

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.os.Build
import android.os.IBinder
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * 小轩音乐 · 媒体前台服务
 * ------------------------------------------------------------------
 * 规则（与产品要求一致）：
 *  - App 活着（后台没被清掉）→ 状态栏 / 锁屏常驻媒体模块（听不听歌都在）
 *  - 从最近任务划掉（完全清后台）→ onTaskRemoved：移除通知、停服务、释放 MediaSession
 *
 * MediaSession 提供锁屏媒体卡片（Android 11+ 锁屏控制来自 MediaSession 而非通知本身）。
 * 按钮 / MediaSession 回调统一广播 MEDIA_<action>，由 XuanNativePlugin 转发给 JS。
 */
class XuanMediaService : Service() {

    companion object {
        const val CHANNEL_ID = "xuan_media"
        const val NOTI_ID = 20261108
        const val ACTION_UPDATE = "com.music.xuan.MEDIA_UPDATE"
        const val ACTION_STOP = "com.music.xuan.MEDIA_STOP"
        const val EXTRA_TITLE = "title"
        const val EXTRA_ARTIST = "artist"
        const val EXTRA_PLAYING = "playing"
        const val EXTRA_COVER = "cover"
        const val EXTRA_SHOW_FAV = "showFavorite"
        const val EXTRA_LIKED = "liked"
    }

    private var session: MediaSessionCompat? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
        session = MediaSessionCompat(this, "XuanMedia").apply {
            isActive = true
            setCallback(object : MediaSessionCompat.Callback() {
                private fun send(action: String) {
                    val i = Intent(XuanNativePlugin.ACTION_PREFIX + action).setPackage(packageName)
                    sendBroadcast(i)
                }
                override fun onPlay() = send("play")
                override fun onPause() = send("pause")
                override fun onSkipToNext() = send("next")
                override fun onSkipToPrevious() = send("prev")
            })
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopForegroundCompat()
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                val title = intent?.getStringExtra(EXTRA_TITLE) ?: "小轩音乐"
                val artist = intent?.getStringExtra(EXTRA_ARTIST) ?: ""
                val playing = intent?.getBooleanExtra(EXTRA_PLAYING, false) ?: false
                val cover = intent?.getStringExtra(EXTRA_COVER)
                val showFav = intent?.getBooleanExtra(EXTRA_SHOW_FAV, false) ?: false
                val liked = intent?.getBooleanExtra(EXTRA_LIKED, false) ?: false
                showMedia(title, artist, playing, cover, showFav, liked)
            }
        }
        // 服务被系统回收后重建时恢复通知（保活）
        return START_STICKY
    }

    private fun icon(name: String): Int {
        val id = resources.getIdentifier(name, "drawable", packageName)
        return if (id != 0) id else android.R.drawable.ic_media_play
    }

    private fun pending(action: String): PendingIntent {
        val i = Intent(XuanNativePlugin.ACTION_PREFIX + action).setPackage(packageName)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getBroadcast(this, action.hashCode(), i, flags)
    }

    private fun contentIntent(): PendingIntent {
        val i = packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent(this, MainActivity::class.java)
        return PendingIntent.getActivity(
            this, 0, i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun decodeCover(cover: String?) = try {
        if (cover.isNullOrEmpty()) null else {
            val bytes = Base64.decode(
                cover.removePrefix("data:image/png;base64,").removePrefix("data:image/jpeg;base64,"),
                Base64.DEFAULT
            )
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        }
    } catch (_: Throwable) { null }

    /** 状态栏小图标：优先软件图标单色版，其次白色软件矢量，最后才回退音乐符号。 */
    private fun appSmallIcon(): Int {
        val mono = resources.getIdentifier("ic_launcher_monochrome", "mipmap", packageName)
        if (mono != 0) return mono
        val d = resources.getIdentifier("ic_xuan_app_noti", "drawable", packageName)
        return if (d != 0) d else icon("ic_xuan_note")
    }

    /** 没有专辑封面时，通知大图标显示软件图标本体（彩色）。 */
    private fun appLargeIcon() = try {
        val id = resources.getIdentifier("ic_launcher", "mipmap", packageName)
        if (id != 0) BitmapFactory.decodeResource(resources, id) else null
    } catch (_: Throwable) { null }

    private fun showMedia(title: String, artist: String, playing: Boolean, cover: String?, showFav: Boolean, liked: Boolean) {
        val bmp = decodeCover(cover)

        // MediaSession 状态：锁屏卡片 / 蓝牙 / 耳机按键都认它
        session?.let { s ->
            s.setPlaybackState(
                PlaybackStateCompat.Builder()
                    .setActions(
                        PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE
                                or PlaybackStateCompat.ACTION_PLAY_PAUSE
                                or PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                                or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                    )
                    .setState(
                        if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
                        PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f
                    )
                    .build()
            )
            s.setMetadata(
                MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                    .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                    .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "小轩音乐")
                    .apply { if (bmp != null) putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, bmp) }
                    .build()
            )
        }

        val playAction = if (playing) {
            NotificationCompat.Action(icon("ic_xuan_pause"), "暂停", pending("pause"))
        } else {
            NotificationCompat.Action(icon("ic_xuan_play"), "播放", pending("play"))
        }

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(appSmallIcon())
            .setContentTitle(title)
            .setContentText(artist)
            .setOngoing(true)               // 常驻：不能被手动划掉，只有清后台才消失
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setContentIntent(contentIntent())
            .addAction(icon("ic_xuan_prev"), "上一首", pending("prev"))
            .addAction(playAction)

        // 登录后把「收藏」排到第三个动作：紧凑视图 setShowActionsInCompactView(0,1,2)
        // 只显示前三个，之前收藏排第四，折叠状态下完全看不到点赞按钮。
        if (showFav) {
            val favIcon = if (liked) icon("ic_xuan_fav_on") else icon("ic_xuan_fav_off")
            builder.addAction(favIcon, if (liked) "取消收藏" else "收藏", pending("like"))
        }
        builder.addAction(icon("ic_xuan_next"), "下一首", pending("next"))

        session?.let { s ->
            try {
                builder.setStyle(
                    androidx.media.app.NotificationCompat.MediaStyle()
                        .setMediaSession(s.sessionToken)
                        .setShowActionsInCompactView(0, 1, 2)
                )
            } catch (_: Throwable) { }
        }

        if (bmp != null) builder.setLargeIcon(bmp) else appLargeIcon()?.let { builder.setLargeIcon(it) }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            // 无通知权限：前台服务仍要 start（保活），只是抽屉里看不到
            val n = builder.build()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTI_ID, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            } else {
                startForeground(NOTI_ID, n)
            }
            return
        }
        val n = builder.build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTI_ID, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTI_ID, n)
        }
    }

    private fun stopForegroundCompat() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (_: Throwable) { }
        try { session?.isActive = false; session?.release() } catch (_: Throwable) { }
        session = null
    }

    /** 完全清掉后台（最近任务划掉 App）→ 通知消失 */
    override fun onTaskRemoved(rootIntent: Intent?) {
        stopForegroundCompat()
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        try { session?.isActive = false; session?.release() } catch (_: Throwable) { }
        session = null
        super.onDestroy()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val ch = NotificationChannel(CHANNEL_ID, "小轩音乐播放控制", NotificationManager.IMPORTANCE_LOW).apply {
                description = "播放、切歌与收藏控制"
                setShowBadge(false)
                lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
            }
            mgr.createNotificationChannel(ch)
        }
    }
}
