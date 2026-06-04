/**
 * 设置页面逻辑
 */
let providers = {};
let currentProvider = 'windows';
let config = {};

async function init() {
  const data = await window.voiceAPI.getConfig();
  providers = data.providers;
  currentProvider = data.currentProvider;
  config = data.config;
  renderProviders();
  renderConfig();
}

function renderProviders() {
  const list = document.getElementById('providerList');
  list.innerHTML = '';
  for (const [key, p] of Object.entries(providers)) {
    const item = document.createElement('div');
    item.className = 'radio-item';
    item.innerHTML = '<input type="radio" name="provider" value="' + key + '" ' + (key === currentProvider ? 'checked' : '') + '>' +
      '<div class="label"><div class="name">' + p.name + '</div>' +
      '<div class="desc">' + (p.needApiKey ? '需要配置 API Key' : '无需配置，开箱即用') + '</div></div>';
    item.querySelector('input').addEventListener('change', () => {
      currentProvider = key;
      renderConfig();
    });
    list.appendChild(item);
  }
}

function renderConfig() {
  const p = providers[currentProvider];
  const container = document.getElementById('providerConfig');
  if (!p || !p.needApiKey) {
    container.innerHTML = '<div style="font-size:13px;color:rgba(255,255,255,0.4);padding:8px 0;">当前引擎无需额外配置，开箱即用。</div>';
    return;
  }
  let html = '<div class="form-group"><label>API Key</label>' +
    '<input type="text" id="apiKey" value="' + (config.apiKey || '') + '" placeholder="输入 API Key">' +
    '<div class="hint">从对应平台获取你的 API Key</div></div>';
  if (p.needSecretKey) {
    html += '<div class="form-group"><label>Secret Key</label>' +
      '<input type="text" id="secretKey" value="' + (config.secretKey || '') + '" placeholder="输入 Secret Key">' +
      '<div class="hint">百度智能云中获取 Secret Key</div></div>';
  }
  if (currentProvider === 'baidu') {
    html += '<div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:12px;line-height:1.6;">\ud83d\udca1 百度 API Key 获取：\n1. 访问 console.bce.baidu.com\n2. 创建应用选择「短语音识别」\n3. 获取 API Key 和 Secret Key\n免费额度充足</div>';
  } else if (currentProvider === 'whisper') {
    html += '<div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:12px;line-height:1.6;">\ud83d\udca1 获取 OpenAI API Key：platform.openai.com\nWhisper 价格约 \u00a50.04/分钟</div>';
  }
  container.innerHTML = html;
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const saveConfig = { provider: currentProvider };
  const apiKeyInput = document.getElementById('apiKey');
  const secretKeyInput = document.getElementById('secretKey');
  if (apiKeyInput) saveConfig.apiKey = apiKeyInput.value;
  if (secretKeyInput) saveConfig.secretKey = secretKeyInput.value;
  const result = await window.voiceAPI.saveConfig(saveConfig);
  const msg = document.getElementById('statusMsg');
  if (result.success) { msg.textContent = '\u2705 设置已保存'; msg.className = 'status-msg success'; }
  else { msg.textContent = '\u274c 保存失败'; msg.className = 'status-msg error'; }
  setTimeout(() => { msg.className = 'status-msg'; }, 3000);
});

init();
