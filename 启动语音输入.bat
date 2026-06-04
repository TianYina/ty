@echo off
title 语音输入工具
cd /d "%~dp0"
echo 正在启动语音输入工具...
echo.
start "" /B node_modules\electron\dist\electron.exe "%CD%"
echo 启动完成！
echo 按 Ctrl+Shift+V 呼出录音窗口
echo 托盘图标在右下角通知区域
echo.
echo 按任意键关闭本窗口（工具仍在后台运行）
pause >nul
