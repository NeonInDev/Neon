param($OutputFile)

# Garante que o arquivo existe desde o inicio
$null = New-Item -Path $OutputFile -ItemType File -Force

Add-Type -AssemblyName System.Speech

$rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$grammar = New-Object System.Speech.Recognition.DictationGrammar
$rec.LoadGrammar($grammar)

$null = Register-ObjectEvent -InputObject $rec -EventName SpeechRecognized -Action {
  $text = $EventArgs.Result.Text
  $text | Set-Content -Path $Event.MessageData -Force
} -MessageData $OutputFile

$rec.SetInputToDefaultAudioDevice()
$rec.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)

while ($true) { Start-Sleep -Seconds 1 }
