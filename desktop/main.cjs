'use strict';
// 小轩音乐 Windows 桌面版：精简 Electron 壳。
// 前端与安卓客户端共用同一份 dist；不注入 window.electron，
// 让前端自动走网页运行时（界面/功能与客户端一致），只额外标记桌面平台。
const { app, BrowserWindow, shell, ipcMain, session } = require('electron');
const path = require('path');

const APP_TITLE = '小轩音乐';
let mainWindow = null;

// file:// 页面访问 music.jrr.lol 的接口属于跨域，桌面本地应用放行；
// 服务端本身也已带 Access-Control-Allow-Origin: *。
function allowLocalAppRequests() {
  try {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === 'access-control-allow-origin') delete headers[k];
      }
      headers['Access-Control-Allow-Origin'] = ['*'];
      callback({ responseHeaders: headers });
    });
  } catch (_) { /* 某些 Electron 版本不支持，忽略即可 */ }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 810,
    minWidth: 1024,
    minHeight: 576,
    title: APP_TITLE,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    center: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      backgroundThrottling: false,
    },
  });
  mainWindow = win;

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    // 只保留本地应用页面，外部链接交给系统浏览器
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
}

ipcMain.handle('xuan:open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) return shell.openExternal(url);
  return false;
});
ipcMain.handle('xuan:app-version', () => app.getVersion());

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    allowLocalAppRequests();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('window-all-closed', () => app.quit());
}
