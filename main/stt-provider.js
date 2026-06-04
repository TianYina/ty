/**
 * 语音识别接口层 - STT Provider
 * 
 * 默认使用 Windows 原生语音识别（无需配置）
 * 可选百度飞桨 / OpenAI Whisper（需配置 API Key）
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const providers = {};

// ============================================================
// Provider 1: Windows 原生语音识别（免费、离线、零配置）
// 通过 PowerShell 调用 Windows.Media.SpeechRecognition
// ============================================================
providers.windows = {
  name: 'Windows 原生语音识别',
  needApiKey: false,
  needSecretKey: false,
  async recognize(audioBuffer) {
    // Windows 原生方案不走音频文件，而是用系统麦克风直接识别
    // 这里我们返回一个特殊标记，让调用方走不同的路径
    return { _useWindowsBuiltin: true };
  }
};

// ============================================================
// Provider 2: 百度语音识别（免费额度，需注册）
// ============================================================
providers.baidu = {
  name: '百度语音识别',
  needApiKey: true,
  needSecretKey: true,
  async recognize(wavBuffer, apiKey, secretKey) {
    const token = await _getBaiduToken(apiKey, secretKey);
    
    // 百度 API 要求 PCM 数据，16000Hz, 16bit, mono
    // 需要把 WAV 头部去掉只传 PCM 数据
    const pcmData = _stripWavHeader(wavBuffer);
    
    const base64 = pcmData.toString('base64');
    const response = await axios.post(
      `https://vop.baidu.com/server_api`,
      {
        format: 'pcm',
        rate: 16000,
        channel: 1,
        cuid: 'voice-typer-pro',
        token: token,
        speech: base64,
        len: pcmData.length,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    if (response.data.err_no === 0) {
      return response.data.result[0];
    }
    throw new Error(`百度识别失败 (${response.data.err_no}): ${response.data.err_msg || '未知错误'}`);
  }
};

async function _getBaiduToken(apiKey, secretKey) {
  const res = await axios.get(
    `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`,
    { timeout: 10000 }
  );
  return res.data.access_token;
}

function _stripWavHeader(buffer) {
  // WAV 文件头部 44 字节，后面是 PCM 数据
  return buffer.subarray(44);
}

// ============================================================
// Provider 3: OpenAI Whisper（付费，但便宜且效果好）
// ============================================================
providers.whisper = {
  name: 'OpenAI Whisper',
  needApiKey: true,
  needSecretKey: false,
  async recognize(wavBuffer, apiKey) {
    const tmpFile = path.join(os.tmpdir(), `voice-typer-${Date.now()}.wav`);
    fs.writeFileSync(tmpFile, wavBuffer);

    try {
      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', fs.createReadStream(tmpFile));
      form.append('model', 'whisper-1');
      form.append('language', 'zh');

      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        form,
        {
          headers: {
            ...form.getHeaders(),
            'Authorization': `Bearer ${apiKey}`,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 60000,
        }
      );
      return response.data.text;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  }
};

// ============================================================
// 状态管理
// ============================================================
let currentProvider = 'windows';
let config = {
  apiKey: '',
  secretKey: '',
  autoPaste: true,  // 识别后自动上屏
};

function setProvider(name) {
  if (providers[name]) {
    currentProvider = name;
    return true;
  }
  return false;
}

function setConfig(newConfig) {
  Object.assign(config, newConfig);
  // 持久化配置
  const configPath = path.join(os.homedir(), '.voice-typer-config.json');
  try {
    fs.writeFileSync(configPath, JSON.stringify({ provider: currentProvider, ...config }, null, 2));
  } catch (_) {}
}

function getProviders() {
  const list = {};
  for (const [key, p] of Object.entries(providers)) {
    list[key] = { name: p.name, needApiKey: p.needApiKey, needSecretKey: p.needSecretKey };
  }
  return list;
}

function getCurrentProvider() { return currentProvider; }
function getConfig() { return { ...config }; }

// 加载持久化的配置
function loadConfig() {
  const configPath = path.join(os.homedir(), '.voice-typer-config.json');
  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (data.provider && providers[data.provider]) {
      currentProvider = data.provider;
    }
    config.apiKey = data.apiKey || '';
    config.secretKey = data.secretKey || '';
    config.autoPaste = data.autoPaste !== undefined ? data.autoPaste : true;
  } catch (_) {}
}

loadConfig();


async function recognize(audioBuffer) {
  const p = providers[currentProvider];
  if (!p) throw new Error('No speech recognition provider found: ' + currentProvider);
  
  // Windows 原生模式走特殊路径
  if (currentProvider === 'windows') {
    return p.recognize(audioBuffer);
  }
  
  return p.recognize(audioBuffer, config.apiKey, config.secretKey);
}

module.exports = { recognize, setProvider, setConfig, getProviders, getCurrentProvider, getConfig };
