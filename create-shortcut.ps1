$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\OneDrive - Netcompany\Desktop\MyPlanner Refresh.lnk")
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = '"c:\Users\pkontog\Projects\myplanner-cloud\refresh-silent.vbs"'
$Shortcut.WorkingDirectory = "c:\Users\pkontog\Projects\myplanner-cloud"
$Shortcut.IconLocation = "shell32.dll,238"
$Shortcut.Description = "Refresh MyPlanner data (silent)"
$Shortcut.Save()
Write-Host "Silent shortcut created on OneDrive Desktop"
