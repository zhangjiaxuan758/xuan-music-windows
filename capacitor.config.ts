import type { CapacitorConfig } from '@capacitor/cli';

// 当前文件：Xuan Android Capacitor 容器的构建与 WebView 配置。

const config: CapacitorConfig = {
  appId: 'com.music.xuan',
  appName: '小轩音乐',
  webDir: 'dist',
  loggingBehavior: 'debug',
  backgroundColor: '#09090b',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    cleartext: true,
  },
  plugins: {
    // 请求走原生 HTTP 层，绕过 WebView 跨域限制，并由原生统一管理 Cookie，
    // 便于连接使用者自建的音源后端（含 HTTP 局域网地址）。
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
    SplashScreen: {
      launchAutoHide: true,
      // 启动图已移除：0 = 不显示启动动画，配合启动主题纯色背景直接进入界面
      launchShowDuration: 0,
      backgroundColor: '#09090b',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT',
      backgroundColor: '#09090b',
    },
  },
};

export default config;
