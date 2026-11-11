; 小轩音乐 Windows 桌面版 — NSIS 安装脚本（Linux makensis 编译）
; 产物：xuan-music-desktop.exe，标准 Windows 安装程序（PE/MZ）
Unicode true

!define APPNAME "小轩音乐"
!define APPVERSION "1.7.3"
!define APPEXE "xuan-music.exe"
!define PUBLISHER "小轩音乐"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\XuanMusicDesktop"

Name "${APPNAME} ${APPVERSION}"
OutFile "/tmp/xuan-desktop/release/xuan-music-desktop.exe"
; 用户级安装，无需管理员权限
InstallDir "$LOCALAPPDATA\Programs\XuanMusic"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 32
XPStyle on

!include "MUI2.nsh"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPEXE}"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "安装"
  SetOutPath "$INSTDIR"
  ; 打包 electron-builder 产出的 win-unpacked 全部内容（含 app.asar、主程序、dll）
  ; Linux makensis 下源路径为 POSIX 路径，/x 排除临时产物
  File /r "/tmp/xuan-desktop/release/win-unpacked/*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; 快捷方式
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${APPEXE}"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\卸载 ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPEXE}"

  ; 卸载注册表项（用户级 HKCU）
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME} ${APPVERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${APPVERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${APPEXE}"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\Uninstall.exe"
  ; 卸载时删除整个安装目录（用户数据在系统 AppData，由应用自身管理，不在此目录）
  RMDir /r "$INSTDIR"
  Delete "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}\卸载 ${APPNAME}.lnk"
  RMDir "$SMPROGRAMS\${APPNAME}"
  Delete "$DESKTOP\${APPNAME}.lnk"
  DeleteRegKey HKCU "${UNINSTKEY}"
SectionEnd
