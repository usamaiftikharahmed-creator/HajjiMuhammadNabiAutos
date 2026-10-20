Add-Type -AssemblyName System.Drawing

$bmp = New-Object System.Drawing.Bitmap(128, 128)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$c1 = [System.Drawing.Color]::FromArgb(30, 58, 138)
$c2 = [System.Drawing.Color]::FromArgb(15, 23, 42)
$rect = New-Object System.Drawing.Rectangle(4, 4, 120, 120)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, [float]45)
$g.FillEllipse($brush, $rect)

$goldColor = [System.Drawing.Color]::FromArgb(217, 119, 6)
$pen = New-Object System.Drawing.Pen($goldColor, [float]5)
$g.DrawEllipse($pen, $rect)

$fontStyle = [System.Drawing.FontStyle]::Bold
$font = New-Object System.Drawing.Font("Arial", [float]30, $fontStyle)
$textBrush = [System.Drawing.Brushes]::White
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString("HMN", $font, $textBrush, [float]64, [float]64, $sf)

$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $ms.ToArray()

$outputPath = Join-Path $PSScriptRoot "app_icon.ico"
$fs = [System.IO.File]::Create($outputPath)
$bw = New-Object System.IO.BinaryWriter($fs)

# ICONDIR
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]1)

# ICONDIRENTRY
$bw.Write([byte]128)
$bw.Write([byte]128)
$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([uint16]1)
$bw.Write([uint16]32)
$bw.Write([uint32]$pngBytes.Length)
$bw.Write([uint32]22)

# Write PNG payload
$bw.Write($pngBytes)
$bw.Close()
$fs.Close()
$bmp.Dispose()
$ms.Dispose()

Write-Host "SUCCESS: app_icon.ico created at $outputPath"
