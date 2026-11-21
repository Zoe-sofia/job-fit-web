Option Explicit
' 停止 OfferFit 后台静态服务（按端口 5180 定位监听进程）
Dim sh, ex, txt, lines, ln, parts, pid, hit

Set sh = CreateObject("WScript.Shell")
Set ex = sh.Exec(sh.ExpandEnvironmentStrings("%ComSpec%") & " /c netstat -ano -p tcp")

txt = ""
Do While Not ex.StdOut.AtEndOfStream
  txt = txt & ex.StdOut.ReadLine() & vbCrLf
Loop

lines = Split(txt, vbCrLf)
pid = ""
For Each ln In lines
  If InStr(ln, ":5180") > 0 And InStr(UCase(ln), "LISTENING") > 0 Then
    parts = Split(Trim(ln), " ")
    For Each hit In parts
      If Len(Trim(hit)) > 0 Then pid = Trim(hit)
    Next
  End If
Next

If pid = "" Then
  MsgBox "没有发现正在运行的 OfferFit 服务（端口 5180 未监听）。", 64, "OfferFit"
  WScript.Quit 0
End If

sh.Run "taskkill /PID " & pid & " /F", 0, False
WScript.Sleep 800

If ListeningOn("5180") Then
  MsgBox "已向进程 " & pid & " 发送结束指令，但端口仍被占用，请稍后重试或在任务管理器中结束。", 48, "OfferFit"
Else
  MsgBox "OfferFit 服务已停止（进程 " & pid & "）。", 64, "OfferFit"
End If

Function ListeningOn(p)
  ListeningOn = (sh.Run("%ComSpec% /c netstat -ano -p tcp | findstr LISTENING | findstr :" & p, 0, True) = 0)
End Function
