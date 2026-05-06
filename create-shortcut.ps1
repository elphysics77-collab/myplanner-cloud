$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\MyPlanner Refresh.lnk")
$Shortcut.TargetPath = "cmd.exe"
$Shortcut.Arguments = '/c "c:\Users\pkontog\Projects\myplanner-cloud\refresh.bat"'
$Shortcut.WorkingDirectory = "c:\Users\pkontog\Projects\myplanner-cloud"
$Shortcut.IconLocation = "shell32.dll,238"
$Shortcut.Description = "Refresh MyPlanner data"
$Shortcut.Save()
Write-Host "Shortcut created on Desktop"
