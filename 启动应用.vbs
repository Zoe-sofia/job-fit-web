Option Explicit
' OfferFit 静默启动器：不显示任何控制台窗口，后台起本地服务后直接打开网址
Dim fso, sh, base, port, url, cmd, i

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

base = fso.GetParentFolderName(WScript.ScriptFullName)
port = "5180"
url = "http://127.0.0.1:" & port & "/index.html"
sh.CurrentDirectory = base

' 已有实例在跑：直接开浏览器，避免端口冲突
If Listening(port) Then
  sh.Run url, 1, False
  WScript.Quit 0
End If

' 依次探测可用运行时：真正执行一次，能识别"应用商店占位符"
If Works("py -c ""import sys""") Then
  cmd = "py -m http.server " & port & " --bind 127.0.0.1"
ElseIf Works("pythonw -c ""import sys""") Then
  cmd = "pythonw -m http.server " & port & " --bind 127.0.0.1"
ElseIf Works("python -c ""import sys""") Then
  cmd = "python -m http.server " & port & " --bind 127.0.0.1"
ElseIf Works("node -e ""1""") Then
  cmd = "node ""serve.js"" " & port
Else
  MsgBox "未检测到可用的 Python 或 Node.js。" & vbCrLf & vbCrLf & _
         "将以文件方式打开 index.html：" & vbCrLf & _
         "  可用：粘贴文本、导入 DOCX / TXT" & vbCrLf & _
         "  不可用：PDF 导入（浏览器会拦截解析线程）" & vbCrLf & vbCrLf & _
         "安装 Python 3 或 Node.js 后，重新双击本文件即可恢复正常。", 48, "OfferFit"
  sh.Run """" & base & "\index.html""", 1, False
  WScript.Quit 0
End If

' 0 = 隐藏窗口，不弹出任何终端
sh.Run cmd, 0, False

' 等服务就绪（最多约 6 秒）
For i = 1 To 40
  WScript.Sleep 150
  If Listening(port) Then Exit For
Next

sh.Run url, 1, False

Function Works(c)
  Works = (sh.Run("cmd /c " & c & " >nul 2>nul", 0, True) = 0)
End Function

Function Listening(p)
  Listening = (sh.Run("cmd /c netstat -ano -p tcp | findstr LISTENING | findstr :" & p, 0, True) = 0)
End Function
