import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n/config';
import './index.css';
import App from './App';
import RemoteControlApp from './components/remote/RemoteControlApp';
import ObsBrowserSourceApp from './components/obs/ObsBrowserSourceApp';
import ObsNowPlayingSourceApp from './components/obs/ObsNowPlayingSourceApp';
import ObsPlayerCapSourceApp from './components/obs/ObsPlayerCapSourceApp';
import { getRuntimeEnvironment } from './platform/runtime';

// src/bootstrap.tsx
// Mounts the React app after index.tsx installs runtime-level browser shims.

/**
 * 网页端竖屏自动横屏：与客户端 App 保持一致的横屏体验。
 * 仅对触屏设备（手机/平板浏览器）在竖屏时把整个应用旋转 90°；
 * App 内置 WebView 恒为横屏不会触发，桌面大屏浏览器不旋转。
 */
const applyWebLandscapeRotation = (el: HTMLElement) => {
  if (getRuntimeEnvironment() === 'capacitor-android') return;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const smallSide = Math.min(window.innerWidth, window.innerHeight);
  if (!coarse || smallSide > 1024) return;
  const apply = () => {
    const pw = window.innerWidth;
    const ph = window.innerHeight;
    if (ph > pw) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      el.style.position = 'fixed';
      el.style.top = '0';
      el.style.left = `${pw}px`;
      el.style.width = `${ph}px`;
      el.style.height = `${pw}px`;
      el.style.transform = 'rotate(90deg)';
      el.style.transformOrigin = '0 0';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      const s = el.style;
      s.position = ''; s.top = ''; s.left = ''; s.width = ''; s.height = '';
      s.transform = ''; s.transformOrigin = '';
    }
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const searchParams = new URLSearchParams(window.location.search);
const isObsBrowserSource = searchParams.get('obs') === '1' || window.location.pathname === '/obs';
const obsSource = searchParams.get('obsSource');
// obsSource=now-playing / playercap: static OBS overlay that connects directly to NowPlaying / PlayerCap in the browser (no Electron SSE relay).
const isNowPlayingObsSource = isObsBrowserSource && obsSource === 'now-playing';
const isPlayerCapObsSource = isObsBrowserSource && obsSource === 'playercap';
const isMainApp = !isObsBrowserSource && searchParams.get('remote') !== '1';
if (isMainApp) {
  applyWebLandscapeRotation(rootElement);
}
root.render(
  <React.StrictMode>
    {isNowPlayingObsSource
      ? <ObsNowPlayingSourceApp />
      : isPlayerCapObsSource
        ? <ObsPlayerCapSourceApp />
        : isObsBrowserSource
          ? <ObsBrowserSourceApp />
          : searchParams.get('remote') === '1'
            ? <RemoteControlApp />
            : <App />}
  </React.StrictMode>
);
