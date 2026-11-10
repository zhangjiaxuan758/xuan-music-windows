'use strict';
const { contextBridge } = require('electron');

// 唯一标记：桌面版。客户端扫码登录据此使用网易云 PC 档位（type=3），
// 网易云 App 确认页显示「登录PC端」。不暴露 window.electron，前端自动走网页运行时。
contextBridge.exposeInMainWorld('__xuanDesktop', true);
