/**
 * Windows 原生语音识别模块
 * 调用 PowerShell 脚本使用 System.Speech API
 * 无需任何配置，离线可用
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const psScriptPath = path.join(__dirname, 'speech-recog.ps1');

function ensureScript() {
  if (fs.existsSync(psScriptPath)) return;

  const lines = [];
  lines.push('Add-Type -AssemblyName System.Speech');
  lines.push('try {');
  lines.push('  $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine([System.Globalization.CultureInfo]::GetCultureInfo("zh-CN"))');
  lines.push('  $grammar = New-Object System.Speech.Recognition.DictationGrammar');
  lines.push('  $recognizer.LoadGrammar($grammar)');
  lines.push('  $result = $null');
  lines.push('  $done = $false');
  lines.push('  Register-ObjectEvent -InputObject $recognizer -EventName SpeechRecognized -Action {');
  lines.push('    $script:result = $event.SourceEventArgs.Result.Text');
  lines.push('    $script:done = $true');
  lines.push('  } > $null');
  lines.push('  $recognizer.SetInputToDefaultAudioDevice()');
  lines.push('  $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Single)');
  lines.push('  $timeout = 15');
  lines.push('  $elapsed = 0');
  lines.push('  while (-not $script:done -and $elapsed -lt $timeout) {');
  lines.push('    Start-Sleep -Milliseconds 500');
  lines.push('    $elapsed += 0.5');
  lines.push('  }');
  lines.push('  $recognizer.RecognizeAsyncCancel()');
  lines.push('  $recognizer.UnloadAllGrammars()');
  lines.push('  $recognizer.Dispose()');
  lines.push('  if ($script:result) {');
  lines.push('    Write-Output $script:result');
  lines.push('  } else {');
  lines.push('    Write-Output "__TIMEOUT__"');
  lines.push('  }');
  lines.push('} catch {');
  lines.push('  Write-Output "__ERROR__: $($_.Exception.Message)"');
  lines.push('}');

  fs.writeFileSync(psScriptPath, lines.join('\n'), 'utf-8');
}

async function recognize() {
  ensureScript();
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', psScriptPath
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('error', (err) => reject(new Error('启动语音识别失败: ' + err.message)));
    proc.on('close', (code) => {
      const text = stdout.trim();
      if (text.startsWith('__ERROR__')) {
        reject(new Error(text.replace('__ERROR__: ', '')));
      } else if (text === '__TIMEOUT__') {
        reject(new Error('没有检测到语音输入'));
      } else if (text) {
        resolve(text);
      } else {
        reject(new Error('语音识别失败: ' + (stderr || '未知错误')));
      }
    });
  });
}

module.exports = { recognize };
