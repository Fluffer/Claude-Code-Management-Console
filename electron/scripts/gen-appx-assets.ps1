# Generates the AppX tile/logo PNGs that Windows shows in the taskbar and Start
# menu, derived from the same app.ico used by the window and tray. electron-builder
# reads custom AppX assets from build/appx; without these it ships its own default
# placeholder logos. Re-run after changing resources/app.ico, then repackage.
Add-Type -AssemblyName System.Drawing
$electron = Split-Path -Parent $PSScriptRoot
$ico = Join-Path $electron 'resources\app.ico'
$out = Join-Path $electron 'build\appx'
New-Item -ItemType Directory -Force -Path $out | Out-Null

# Best available frame from the multi-res ico (128x128 is the largest).
$src = ([System.Drawing.Icon]::new($ico, 256, 256)).ToBitmap()

# Sample the solid background colour (terracotta) from a non-glyph edge pixel.
$bg = $src.GetPixel([int]($src.Width/2), 6)
Write-Host "bg = $($bg.R),$($bg.G),$($bg.B)"

function Save-Square([int]$size, [string]$name) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode  = 'HighQuality'
  $g.SmoothingMode    = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose()
  $bmp.Save("$out\$name", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "wrote $name ($size x $size)"
}

function Save-Wide([int]$w, [int]$h, [string]$name) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode  = 'HighQuality'
  $g.SmoothingMode    = 'HighQuality'
  # Fill whole wide tile with the logo background colour, centre the glyph tile.
  $g.Clear($bg)
  $logo = [int]($h * 0.72)
  $x = [int](($w - $logo) / 2)
  $y = [int](($h - $logo) / 2)
  $g.DrawImage($src, $x, $y, $logo, $logo)
  $g.Dispose()
  $bmp.Save("$out\$name", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "wrote $name ($w x $h)"
}

Save-Square 44  'Square44x44Logo.png'
Save-Square 71  'Square71x71Logo.png'
Save-Square 150 'Square150x150Logo.png'
Save-Square 310 'Square310x310Logo.png'
Save-Square 50  'StoreLogo.png'
Save-Wide -w 310 -h 150 -name 'Wide310x150Logo.png'
$src.Dispose()
Write-Host 'done'
