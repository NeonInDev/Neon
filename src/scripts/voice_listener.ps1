Add-Type -AssemblyName System.Speech

try {
  $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  $rec.SetInputToDefaultAudioDevice()

  $dg = New-Object System.Speech.Recognition.DictationGrammar
  $rec.LoadGrammar($dg)

  $rec.SpeechRecognized += {
    $text = $EventArgs.Result.Text
    if ($text -match '^[Nn][Ee][Oo][Nn][,\s]\s*(.*)') {
      Write-Output $matches[1]
    }
  }

  $rec.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)

  # Keep alive until stdin closes (parent process kills us)
  while ($true) {
    $line = [Console]::In.ReadLine()
    if ($line -eq 'QUIT') { break }
    Start-Sleep -Milliseconds 100
  }
} catch {
  Write-Error $_.Exception.Message
  [Environment]::Exit(1)
} finally {
  try { $rec.Dispose() } catch {}
}
