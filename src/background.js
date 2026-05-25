// CookieFree - Background Service Worker

const SETTINGS_KEY = 'cookiefree_settings';
const WHITELIST_KEY = 'cookiefree_whitelist';
const STATS_KEY = 'cookiefree_stats';

// Load auto-clean schedule on startup
chrome.runtime.onInstalled.addListener(async () => {
  await setupAutoClean();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupAutoClean();
});

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true;
});

async function handleMessage(message, sender, sendResponse) {
  try {
    switch (message.action) {
      case 'clean':
        sendResponse(await cleanData(message.options));
        break;
      case 'getCookies':
        sendResponse(await getCookies(message.domain));
        break;
      case 'deleteCookie':
        sendResponse(await deleteCookie(message.cookie));
        break;
      case 'getWhitelist':
        sendResponse(await getWhitelist());
        break;
      case 'addWhitelist':
        sendResponse(await addWhitelist(message.domain));
        break;
      case 'removeWhitelist':
        sendResponse(await removeWhitelist(message.domain));
        break;
      case 'getSettings':
        sendResponse(await getSettings());
        break;
      case 'saveSettings':
        sendResponse(await saveSettings(message.settings));
        break;
      case 'startAutoClean':
        sendResponse(await startAutoClean());
        break;
      case 'stopAutoClean':
        sendResponse(await stopAutoClean());
        break;
      case 'getStorageUsage':
        sendResponse(await getStorageUsage());
        break;
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// ============== Data Cleaning ==============

async function cleanData(options = {}) {
  const {
    timeRange = 'all',
    clearCookies = true,
    clearCache = true,
    clearHistory = true,
    clearDownloads = true,
    clearLocalStorage = false,
    clearServiceWorkers = false,
    clearFormData = false,
    clearPasswords = false
  } = options;

  const since = getTimeSince(timeRange);
  const whitelist = await getWhitelistData();
  const whitelistDomains = whitelist.map(w => w.domain);

  let removed = { cookies: 0, cache: 0, history: 0, downloads: 0 };

  // Clear cookies (respect whitelist)
  if (clearCookies) {
    if (whitelistDomains.length > 0) {
      // Selective: get all cookies, delete non-whitelisted
      const allCookies = await chrome.cookies.getAll({});
      for (const cookie of allCookies) {
        const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
        if (!whitelistDomains.some(w => domain.includes(w))) {
          await chrome.cookies.remove({
            url: (cookie.secure ? 'https://' : 'http://') + domain + cookie.path,
            name: cookie.name
          }).catch(() => {});
          removed.cookies++;
        }
      }
    } else {
      await chrome.browsingData.removeCookies({ since });
      removed.cookies = -1; // Unknown count
    }
  }

  // Clear cache
  if (clearCache) {
    await chrome.browsingData.removeCache({ since });
    removed.cache = -1;
  }

  // Clear history
  if (clearHistory) {
    await chrome.browsingData.removeHistory({ since });
    removed.history = -1;
  }

  // Clear downloads
  if (clearDownloads) {
    await chrome.browsingData.removeDownloads({ since });
    removed.downloads = -1;
  }

  // Clear localStorage
  if (clearLocalStorage) {
    await chrome.browsingData.removeLocalStorage({ since });
  }

  // Clear service workers
  if (clearServiceWorkers) {
    await chrome.browsingData.removeServiceWorkers({ since });
  }

  // Clear form data
  if (clearFormData) {
    await chrome.browsingData.removeFormData({ since });
  }

  // Clear passwords (be careful!)
  if (clearPasswords) {
    await chrome.browsingData.removePasswords({ since });
  }

  // Update stats
  const stats = await getStatsData();
  stats.totalCleans++;
  stats.lastClean = new Date().toISOString();
  stats[timeRange] = (stats[timeRange] || 0) + 1;
  await chrome.storage.local.set({ [STATS_KEY]: stats });

  // Notify
  if (Object.values(options).some(v => v)) {
    chrome.notifications.create('clean-done', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'CookieFree',
      message: `Cleaned: cookies${clearCookies ? '✓' : ''}, cache${clearCache ? '✓' : ''}, history${clearHistory ? '✓' : ''}`
    });
  }

  return { success: true, removed };
}

// ============== Cookie Management ==============

async function getCookies(domain) {
  const cookies = await chrome.cookies.getAll(domain ? { domain } : {});
  
  // Group by domain
  const grouped = {};
  cookies.forEach(c => {
    const d = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push({
      name: c.name,
      value: c.value ? c.value.substring(0, 20) + (c.value.length > 20 ? '...' : '') : '',
      domain: d,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      session: c.session,
      expires: c.expirationDate
    });
  });
  
  return { success: true, grouped, total: cookies.length };
}

async function deleteCookie(cookie) {
  await chrome.cookies.remove({
    url: (cookie.secure ? 'https://' : 'http://') + cookie.domain + cookie.path,
    name: cookie.name
  });
  return { success: true };
}

// ============== Whitelist Management ==============

async function getWhitelist() {
  return { success: true, domains: await getWhitelistData() };
}

async function addWhitelist(domain) {
  const whitelist = await getWhitelistData();
  if (whitelist.find(w => w.domain === domain)) {
    return { success: false, error: 'Already whitelisted' };
  }
  whitelist.push({ domain, addedAt: new Date().toISOString() });
  await chrome.storage.local.set({ [WHITELIST_KEY]: whitelist });
  return { success: true };
}

async function removeWhitelist(domain) {
  let whitelist = await getWhitelistData();
  whitelist = whitelist.filter(w => w.domain !== domain);
  await chrome.storage.local.set({ [WHITELIST_KEY]: whitelist });
  return { success: true };
}

async function getWhitelistData() {
  const data = await chrome.storage.local.get(WHITELIST_KEY);
  return data[WHITELIST_KEY] || [];
}

// ============== Settings ==============

async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  const defaults = {
    autoCleanEnabled: false,
    autoCleanInterval: 60, // minutes
    autoCleanOptions: {
      timeRange: 'all',
      clearCookies: true,
      clearCache: true,
      clearHistory: false,
      clearDownloads: false
    }
  };
  return { success: true, settings: { ...defaults, ...(data[SETTINGS_KEY] || {}) } };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  await setupAutoClean();
  return { success: true };
}

// ============== Auto Clean ==============

async function setupAutoClean() {
  const settings = await getSettings();
  
  // Clear existing alarm
  await chrome.alarms.clear('autoClean');
  
  if (settings.settings.autoCleanEnabled) {
    chrome.alarms.create('autoClean', {
      periodInMinutes: settings.settings.autoCleanInterval
    });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'autoClean') {
    const { settings } = await getSettings();
    if (settings.autoCleanEnabled) {
      await cleanData(settings.autoCleanOptions);
    }
  }
});

async function startAutoClean() {
  const { settings } = await getSettings();
  settings.autoCleanEnabled = true;
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  await setupAutoClean();
  return { success: true };
}

async function stopAutoClean() {
  const { settings } = await getSettings();
  settings.autoCleanEnabled = false;
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  await chrome.alarms.clear('autoClean');
  return { success: true };
}

// ============== Storage Usage ==============

async function getStorageUsage() {
  const sizes = {
    cookies: 0,
    localStorage: 0,
    sessionStorage: 0,
    cache: 0,
    indexedDB: 0
  };
  
  // Estimate based on cookie count
  const cookies = await chrome.cookies.getAll({});
  sizes.cookies = cookies.length * 200; // Rough estimate: ~200 bytes per cookie
  
  return { success: true, sizes, cookies: cookies.length };
}

// ============== Helpers ==============

function getTimeSince(range) {
  const now = Date.now();
  switch (range) {
    case 'hour': return now - 3600000;
    case 'day': return now - 86400000;
    case 'week': return now - 604800000;
    case 'month': return now - 2592000000;
    default: return 0; // all time
  }
}

async function getStatsData() {
  const data = await chrome.storage.local.get(STATS_KEY);
  return data[STATS_KEY] || { totalCleans: 0, lastClean: null };
}