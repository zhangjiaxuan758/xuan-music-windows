// 小轩音乐：直连官方 eapi 用到的第三方库类型声明（这些包未内置 d.ts）。
declare module 'crypto-js' {
  const CryptoJS: any;
  export default CryptoJS;
}
declare module 'qrcode' {
  const QRCode: {
    toDataURL(text: string, options?: { width?: number; margin?: number; errorCorrectionLevel?: string }): Promise<string>;
  };
  export default QRCode;
}
