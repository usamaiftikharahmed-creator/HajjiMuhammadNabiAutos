$dir = $PSScriptRoot
if (-not $dir) { $dir = (Get-Location).Path }

$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "Hajji Mohammad Nabi Autos.lnk"

$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $dir "Hajji_Mohammad_Nabi_Autos.exe"
$shortcut.WorkingDirectory = $dir
$shortcut.Description = "Hajji Mohammad Nabi Autos - Installment & Roznamcha Management System"
$shortcut.IconLocation = Join-Path $dir "app_icon.ico"
$shortcut.Save()

Write-Host "Desktop shortcut created successfully at: $shortcutPath"
