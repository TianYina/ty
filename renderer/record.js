/**
 * Voice input recorder - click to talk
 */
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let stream = null;

const micIcon = document.getElementById('micIcon');
const statusText = document.getElementById('statusText');
const subText = document.getElementById('subText');
const recognizedText = document.getElementById('recognizedText');
const closeBtn = document.getElementById('closeBtn');
const nativeHint = document.getElementById('nativeHint');

closeBtn.addEventListener('click', () => window.close());

// Click mic icon to start
micIcon.addEventListener('click', async () => {
  try {
    const data = await window.voiceAPI.getConfig();
    if (data.currentProvider === 'windows') {
      // Windows native mode
      statusText.textContent = '\u8bf7\u8bf4\u8bdd...';
      subText.textContent = '';
      micIcon.classList.add('recording');
      nativeHint.classList.add('visible');
      const result = await window.voiceAPI.doNativeRecognize();
      micIcon.classList.remove('recording');
      nativeHint.classList.remove('visible');
      if (result.text) showResult(result.text);
      else {
        statusText.textContent = '\u672a\u68c0\u6d4b\u5230\u8bed\u97f3';
        subText.textContent = result.error || '\u8bf7\u91cd\u8bd5';
        setTimeout(() => window.close(), 2000);
      }
    } else {
      // Cloud recording mode
      startCloudRecording();
    }
  } catch (e) {
    statusText.textContent = '\u9519\u8bef: ' + e.message;
    setTimeout(() => window.close(), 3000);
  }
});

async function startCloudRecording() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
    });
    const mimeType = 'audio/webm;codecs=opus';
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    isRecording = true;
    audioChunks = [];
    micIcon.classList.add('recording');
    statusText.textContent = '\u6b63\u5728\u5f55\u97f3...';
    subText.textContent = '\u8bf4\u5b8c\u81ea\u52a8\u8bc6\u522b\u4e0a\u5c4f';

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };
    mediaRecorder.onstop = async () => {
      isRecording = false;
      micIcon.classList.remove('recording');
      statusText.textContent = '\u6b63\u5728\u8bc6\u522b...';
      subText.textContent = '\u8bf7\u7a0d\u5019';
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      if (audioChunks.length === 0) {
        statusText.textContent = '\u6ca1\u6709\u5f55\u5230\u58f0\u97f3';
        setTimeout(() => window.close(), 1500); return;
      }
      try {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const wavBase64 = await convertToWav(blob);
        const result = await window.voiceAPI.doRecognize(wavBase64);
        if (result.text) showResult(result.text);
        else {
          statusText.textContent = '\u8bc6\u522b\u5931\u8d25: ' + (result.error || '');
          setTimeout(() => window.close(), 2500);
        }
      } catch (err) {
        statusText.textContent = '\u5904\u7406\u51fa\u9519: ' + err.message;
        setTimeout(() => window.close(), 2500);
      }
    };
    mediaRecorder.start(100);
    startSilenceDetection(stream);
    setTimeout(() => { if (isRecording) stopRecording(); }, 15000);
  } catch (err) {
    statusText.textContent = '\u9ea6\u514b\u98ce\u8bbf\u95ee\u5931\u8d25';
    subText.textContent = err.message;
    setTimeout(() => window.close(), 3000);
  }
}

function showResult(text) {
  recognizedText.textContent = text;
  statusText.textContent = '\u2705 \u8bc6\u522b\u6210\u529f';
  subText.textContent = '\u6b63\u5728\u4e0a\u5c4f...';
  setTimeout(async () => { await window.voiceAPI.pasteText(text); }, 300);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
}

function startSilenceDetection(stream) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  let silenceStart = null;
  function check() {
    if (!isRecording) { audioCtx.close(); return; }
    analyser.getByteFrequencyData(dataArray);
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    if (avg < 10) {
      if (silenceStart === null) silenceStart = Date.now();
      else if (Date.now() - silenceStart > 2500) { stopRecording(); audioCtx.close(); return; }
    } else silenceStart = null;
    requestAnimationFrame(check);
  }
  check();
}

async function convertToWav(blob) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const sampleRate = 16000;
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.length * sampleRate / audioBuffer.sampleRate), sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  const rendered = await offlineCtx.startRendering();
  const pcm = rendered.getChannelData(0);
  const numSamples = pcm.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
