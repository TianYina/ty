Add-Type -AssemblyName System.Speech
try {
  $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine([System.Globalization.CultureInfo]::GetCultureInfo("zh-CN"))
  $grammar = New-Object System.Speech.Recognition.DictationGrammar
  $recognizer.LoadGrammar($grammar)

  $result = $null
  $done = $false

  Register-ObjectEvent -InputObject $recognizer -EventName SpeechRecognized -Action {
    $script:result = $event.SourceEventArgs.Result.Text
    $script:done = $true
  } > $null

  $recognizer.SetInputToDefaultAudioDevice()
  $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Single)

  $timeout = 5
  $elapsed = 0
  while (-not $script:done -and $elapsed -lt $timeout) {
    Start-Sleep -Milliseconds 500
    $elapsed += 0.5
  }

  $recognizer.RecognizeAsyncCancel()
  $recognizer.UnloadAllGrammars()
  $recognizer.Dispose()

  if ($script:result) {
    Write-Output $script:result
  } else {
    Write-Output "__TIMEOUT__"
  }
} catch {
  Write-Output "__ERROR__: $($_.Exception.Message)"
}
