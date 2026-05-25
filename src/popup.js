// CookieFree - Popup UI Logic

document.addEventListener('DOMContentLoaded', async () => {
  initUI();
  await updateStorageInfo();
});

function initUI() {
  // Quick clean buttons
  document.querySelectorAll('.clean-btn').forEach(btn => {
    btn.addEventListener('click', () => clean(btn.dataset.time));
  });
  
  // Nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  
  // Whitelist
  document.getElementById('addDomainBtn').addEventListener('click', addDomain);
  document.getElementById('domainInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addDomain();
  });
  document.getElementById('whitelistBackBtn').addEventListener('click', () => switchView('main'));
  
  // Auto clean
  document.getElementById('autoCleanCheck').addEventListener('change', saveAutoSettings);
  document.getElementById('autoInterval').addEventListener('input', debounce(saveAutoSettings, 500));
  document.getElementById('autoBackBtn').addEventListener('click', () => switchView('main'));
  
  // Load settings
  loadSettings();
}

function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(view + 'View').classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${view}"]`)?.classList.add('active');
  
  if (view === 'whitelist') loadWhitelist();
  if (view === 'auto') loadAutoSettings();
}

async function clean(timeRange) {
  const btns = document.querySelectorAll('.clean-btn');
  btns.forEach(b => b.disabled = true);
  
  const status = document.getElementById('status');
  status.className = 'status';
  status.textContent = 'Cleaning...';
  
  const options = {
    timeRange,
    clearCookies: document.getElementById('chkCookies').checked,
    clearCache: document.getElementById('chkCache').checked,
    clearHistory: document.getElementById('chkHistory').checked,
    clearDownloads: document.getElementById('chkDownloads').checked,
    clearLocalStorage: document.getElementById('chkLocalStorage').checked,
  };
  
  const result = await chrome.runtime.sendMessage({ action: 'clean', options });
  
  btns.forEach(b => b.disabled = false);
  
  if (result.success) {
    status.className = 'status success';
    status.textContent = `Cleaned! ${timeRange === 'all' ? '(all time)' : `(last ${timeRange})`}`;
    await updateStorageInfo();
  } else {
    status.className = 'status error';
    status.textContent = `Error: ${result.error || 'unknown'}`;
  }
  
  setTimeout(() => {
    status.className = 'status';
    status.textContent = 'Ready';
  }, 3000);
}

async function updateStorageInfo() {
  const result = await chrome.runtime.sendMessage({ action: 'getStorageUsage' });
  if (result.success) {
    document.getElementById('cookieCount').textContent = result.cookies || '-';
  }
  
  // Get clean count from stats
  const stats = await chrome.storage.local.get('cookiefree_stats');
  document.getElementById('cleanCount').textContent = stats.cookiefree_stats?.totalCleans || 0;
  document.getElementById('estSize').textContent = '~';
}

// ============== Whitelist ==============

async function loadWhitelist() {
  const result = await chrome.runtime.sendMessage({ action: 'getWhitelist' });
  const list = document.getElementById('domainList');
  
  if (!result.success || result.domains.length === 0) {
    list.innerHTML = '<li class="empty-state">No domains whitelisted</li>';
    return;
  }
  
  list.innerHTML = result.domains.map(d => `
    <li class="domain-item">
      <span>${escapeHtml(d.domain)}</span>
      <button class="remove-btn" data-domain="${escapeHtml(d.domain)}">✕</button>
    </li>
  `).join('');
  
  list.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({
        action: 'removeWhitelist',
        domain: btn.dataset.domain
      });
      loadWhitelist();
    });
  });
}

async function addDomain() {
  const input = document.getElementById('domainInput');
  const domain = input.value.trim().replace(/^https?:\/\//, '').replace(/^www\./, '');
  
  if (!domain) return;
  
  const result = await chrome.runtime.sendMessage({
    action: 'addWhitelist',
    domain
  });
  
  if (result.success) {
    input.value = '';
    loadWhitelist();
  } else {
    alert(result.error || 'Failed to add domain');
  }
}

// ============== Auto Clean ==============

async function loadSettings() {
  const result = await chrome.runtime.sendMessage({ action: 'getSettings' });
  if (result.success) {
    document.getElementById('autoCleanCheck').checked = result.settings.autoCleanEnabled || false;
    document.getElementById('autoInterval').value = result.settings.autoCleanInterval || 60;
  }
}

async function loadAutoSettings() {
  await loadSettings();
}

async function saveAutoSettings() {
  const enabled = document.getElementById('autoCleanCheck').checked;
  const interval = parseInt(document.getElementById('autoInterval').value) || 60;
  
  await chrome.runtime.sendMessage({
    action: 'saveSettings',
    settings: {
      autoCleanEnabled: enabled,
      autoCleanInterval: Math.max(5, Math.min(1440, interval))
    }
  });
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}