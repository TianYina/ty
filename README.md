# 语音输入工具 (Voice Typer)

按下 `Ctrl+Shift+V` 呼出录音窗口，对着麦克风说话，自动识别并上屏。

## 使用方法

1. 运行 `启动语音输入.bat` 启动程序
2. 系统托盘出现红色麦克风图标
3. 按 `Ctrl+Shift+V` 弹出录音窗口
4. 点击麦克风图标开始说话
5. 说完自动识别并输入到当前光标位置

## 语音识别引擎

默认使用 **Windows 原生语音识别**（离线、免费、零配置）。
可在设置中切换为 **百度语音识别**（需配置 API Key，免费额度充足）。

## 技术栈

- Electron
- Node.js
- Windows Speech API (System.Speech)
- 百度语音识别 API
