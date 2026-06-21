Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 64, 128)
$frames = @()

foreach ($size in $sizes) {
  $bmp = New-Object Drawing.Bitmap($size, $size)
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = "HighQuality"
  $g.InterpolationMode = "HighQualityBicubic"

  # Background
  $g.Clear([Drawing.Color]::FromArgb(10, 10, 15))

  # Glow layers (outer to inner)
  $cx = $size / 2
  $cy = $size / 2
  $fontSize = $size * 0.65

  # Outer glow
  $glowBrush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(20, 0, 212, 255))
  $g.FillEllipse($glowBrush, $cx - $size*0.4, $cy - $size*0.4, $size*0.8, $size*0.8)

  # Mid glow
  $glowBrush2 = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(40, 0, 212, 255))
  $g.FillEllipse($glowBrush2, $cx - $size*0.25, $cy - $size*0.25, $size*0.5, $size*0.5)

  # Draw stylized "N"
  $pen = New-Object Drawing.Pen([Drawing.Color]::FromArgb(0, 212, 255), [Math]::Max(1, $size * 0.12))
  $pen.StartCap = "Round"
  $pen.EndCap = "Round"

  # N letter using lines
  $p1 = New-Object Drawing.PointF($cx - $size*0.3, $cy - $size*0.35)
  $p2 = New-Object Drawing.PointF($cx - $size*0.3, $cy + $size*0.35)
  $p3 = New-Object Drawing.PointF($cx + $size*0.3, $cy - $size*0.35)
  $p4 = New-Object Drawing.PointF($cx + $size*0.3, $cy + $size*0.35)
  $p5 = New-Object Drawing.PointF($cx - $size*0.3, $cy - $size*0.35)

  $g.DrawLine($pen, $p1, $p2)
  $g.DrawLine($pen, $p2, $p3)
  $g.DrawLine($pen, $p3, $p4)

  # Inner highlight
  $pen2 = New-Object Drawing.Pen([Drawing.Color]::FromArgb(180, 255, 255, 255), [Math]::Max(1, $size * 0.04))
  $g.DrawLine($pen2, $p1, $p2)
  $g.DrawLine($pen2, $p2, $p3)
  $g.DrawLine($pen2, $p3, $p4)

  # Small accent dot
  $dotBrush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(0, 212, 255))
  $g.FillEllipse($dotBrush, $cx + $size*0.15, $cy + $size*0.25, $size*0.1, $size*0.1)

  $g.Dispose()
  $frames += $bmp
}

# Save as .ico
$icoStream = New-Object IO.MemoryStream
$writer = New-Object IO.BinaryWriter($icoStream)

$writer.Write([UInt16]0)    # Reserved
$writer.Write([UInt16]1)    # ICO type
$writer.Write([UInt16]$frames.Count)  # Image count

$offset = 6 + $frames.Count * 16
$imageData = @()

foreach ($bmp in $frames) {
  $ms = New-Object IO.MemoryStream
  $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
  $data = $ms.ToArray()
  $ms.Dispose()

  $writer.Write([Byte]$bmp.Width -band 0xFF)  # Width
  $w = $bmp.Width; if ($w -ge 256) { $w = 0 }
  $writer.Write([Byte]$w)
  $writer.Write([Byte]$bmp.Height -band 0xFF)
  $h = $bmp.Height; if ($h -ge 256) { $h = 0 }
  $writer.Write([Byte]$h)
  $writer.Write([Byte]0)  # Colors
  $writer.Write([Byte]0)  # Reserved
  $writer.Write([UInt16]1)  # Color planes
  $writer.Write([UInt16]32) # Bits per pixel
  $writer.Write([UInt32]$data.Length)  # Image size
  $writer.Write([UInt32]$offset)  # Image offset
  $offset += $data.Length
  $imageData += $data
}

foreach ($data in $imageData) {
  $writer.Write($data)
}

$writer.Flush()
$icoPath = "C:\Meus Projetos\Neon\pendrive\assets\neon.ico"
[IO.File]::WriteAllBytes($icoPath, $icoStream.ToArray())

$icoStream.Dispose()
$writer.Dispose()
foreach ($bmp in $frames) { $bmp.Dispose() }

Write-Host "Icone criado: $icoPath ($( (Get-Item $icoPath).Length / 1KB) KB)"
