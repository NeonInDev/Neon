# Open Marvel's Spider-Man if installed
# Common installation paths
$paths = @(
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Marvel's Spider-Man\\Marvel's Spider-Man.exe",
    "C:\\Program Files (x86)\\Epic Games\\Marvel's Spider-Man\\Marvel's Spider-Man.exe",
    "C:\\Program Files\\Marvel's Spider-Man\\Marvel's Spider-Man.exe"
)

$found = $null
foreach ($p in $paths) {
    if (Test-Path $p) {
        $found = $p
        break
    }
}

if ($found) {
    Write-Host "Launching Marvel's Spider-Man from $found"
    Start-Process -FilePath $found
} else {
    Write-Host "Marvel's Spider-Man not found. Informing boss."
    # You can replace this with your notification logic
}
