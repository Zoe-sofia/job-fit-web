@echo off
setlocal
cd /d "%~dp0"

set "PORT=5180"
set "URL=http://127.0.0.1:%PORT%/index.html"
set "LAUNCH="

echo.
echo   OfferFit  -  简历岗位匹配分析
echo   ==================================
echo.

where py >nul 2>nul
if errorlevel 1 goto p2
py -c "import sys" >nul 2>nul
if errorlevel 1 goto p2
set "LAUNCH=py -m http.server %PORT% --bind 127.0.0.1"
goto found

:p2
where python >nul 2>nul
if errorlevel 1 goto p3
python -c "import sys" >nul 2>nul
if errorlevel 1 goto p3
set "LAUNCH=python -m http.server %PORT% --bind 127.0.0.1"
goto found

:p3
where node >nul 2>nul
if errorlevel 1 goto noenv
node -e "1" >nul 2>nul
if errorlevel 1 goto noenv
set "LAUNCH=node serve.js %PORT%"
goto found

:noenv
echo  [提示] 未检测到可用的 Python 或 Node.js。
echo.
echo  将以文件方式打开 index.html：
echo    可用：粘贴文本、导入 DOCX / TXT
echo    不可用：PDF 导入（浏览器会拦截解析线程）
echo.
echo  安装 Python 3 或 Node.js 后，重新双击本文件即可恢复正常。
echo.
start "" "index.html"
echo  按任意键关闭窗口...
pause >nul
goto end

:found
echo   运行环境：%LAUNCH%
echo   访问地址：%URL%
echo.
echo   请保持本窗口开启，关闭窗口即停止服务。
echo.
start "" /b cmd /c "ping -n 3 127.0.0.1 >nul & start %URL%"
%LAUNCH%
if errorlevel 1 goto fail
goto end

:fail
echo.
echo  [提示] 服务未能启动。
echo   常见原因：端口 %PORT% 已被占用，或运行环境异常。
echo   若为端口占用，请先关闭占用该端口的程序，再重新双击本文件。
echo.
pause

:end
endlocal
