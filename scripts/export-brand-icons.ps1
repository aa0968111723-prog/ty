# Package the approved transparent master logo at application icon sizes.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$brandRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\public'))
$brandSource = [System.Drawing.Bitmap]::new((Join-Path $brandRoot 'brand/tkuzen-turtle-3d-v2.png'))
try {
  if ($brandSource.GetPixel(0, 0).A -ne 0) { throw 'Logo must have a transparent background.' }
  foreach ($brandSize in @(32, 48, 180, 192, 512)) {
    $brandBitmap = [System.Drawing.Bitmap]::new($brandSize, $brandSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $brandGraphics = [System.Drawing.Graphics]::FromImage($brandBitmap)
    try {
      $brandGraphics.Clear([System.Drawing.Color]::Transparent)
      $brandGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $brandGraphics.DrawImage($brandSource, 0, 0, $brandSize, $brandSize)
      $brandBitmap.Save((Join-Path $brandRoot "brand/tkuzen-turtle-3d-icon-$brandSize-v2.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $brandGraphics.Dispose(); $brandBitmap.Dispose() }
  }
  Write-Output "Transparent logo verified; exported 32, 48, 180, 192 and 512px icons."
} finally { $brandSource.Dispose() }
