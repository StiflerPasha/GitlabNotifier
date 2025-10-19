// Popup Script
import { StorageManager } from '../js/storage.js';

let settings = {};
let connectionStatus = {};

// Инициализация popup
const initPopup = async () => {
  try {
    settings = await StorageManager.getSettings();
    connectionStatus = await StorageManager.getConnectionStatus();
    updateUI();
    hideLoading();
    
    // Сбрасываем badge при открытии popup
    await StorageManager.resetUnreadCount();
  } catch (error) {
    console.error('Ошибка инициализации:', error);
    hideLoading();
  }
};

// Обновление UI
const updateUI = () => {
  // Статус уведомлений
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const toggleSwitch = document.getElementById('toggleSwitch');

  if (settings.enabled) {
    statusIndicator.classList.add('active');
    statusIndicator.classList.remove('inactive');
    statusText.textContent = 'Активен';
    toggleSwitch.classList.add('active');
  } else {
    statusIndicator.classList.remove('active');
    statusIndicator.classList.add('inactive');
    statusText.textContent = 'Неактивен';
    toggleSwitch.classList.remove('active');
  }

  // GitLab статус
  const gitlabStatus = document.getElementById('gitlabStatus');
  const vpnWarning = document.getElementById('vpnWarning');
  
  if (settings.gitlabUrl && settings.gitlabToken) {
    if (!connectionStatus.available) {
      gitlabStatus.textContent = '⚠️ Недоступен';
      gitlabStatus.classList.add('status-error');
      vpnWarning.style.display = 'block';
      vpnWarning.textContent = `⚠️ ${connectionStatus.error || 'GitLab недоступен. Проверьте VPN подключение.'}`;
    } else {
      gitlabStatus.textContent = '✅ Подключен';
      gitlabStatus.classList.remove('status-error');
      vpnWarning.style.display = 'none';
    }
  } else {
    gitlabStatus.textContent = '❌ Не настроен';
    gitlabStatus.classList.remove('status-error');
    vpnWarning.style.display = 'none';
  }

  // Telegram статус
  const telegramStatus = document.getElementById('telegramStatus');
  if (settings.telegramBotToken && settings.telegramChatId) {
    telegramStatus.textContent = '✅ Подключен';
  } else {
    telegramStatus.textContent = '❌ Не настроен';
  }

  // Количество проектов
  const projectsCount = document.getElementById('projectsCount');
  const projectsNumber = settings.projects?.length || 0;
  projectsCount.textContent = projectsNumber > 0 ? `${projectsNumber} 📌` : '0';

  // Последняя проверка
  updateLastCheckTime();
};

// Обновление времени последней проверки
const updateLastCheckTime = () => {
  const lastCheckEl = document.getElementById('lastCheck');
  const lastChecks = settings.lastChecks || {};
  
  // Берем самую последнюю проверку (MR или пайплайны)
  const mrCommentsCheck = new Date(lastChecks.mrComments || 0);
  const pipelinesCheck = new Date(lastChecks.pipelines || 0);
  const lastCheck = mrCommentsCheck > pipelinesCheck ? mrCommentsCheck : pipelinesCheck;
  
  if (lastCheck.getTime() === 0) {
    lastCheckEl.textContent = 'никогда';
  } else {
    const timeAgo = formatTimeAgo(lastCheck);
    lastCheckEl.textContent = timeAgo;
    console.log(`Popup: время последней проверки обновлено - ${lastCheck.toLocaleString('ru-RU')} (${timeAgo})`);
  }
};

// Форматирование времени "N минут назад"
const formatTimeAgo = (date) => {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'только что';
  if (diffMins < 60) return `${diffMins} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  return `${diffDays} д назад`;
};

// Скрытие экрана загрузки
const hideLoading = () => {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'block';
};

// Переключение уведомлений
const handleToggle = async () => {
  settings.enabled = !settings.enabled;
  await StorageManager.saveSettings({ enabled: settings.enabled });
  updateUI();
};

// Проверка сейчас
const handleCheckNow = async () => {
  const btn = document.getElementById('checkNowBtn');
  const originalText = btn.innerHTML;
  
  btn.disabled = true;
  btn.innerHTML = '⏳ Проверяем...';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkNow' });
    
    if (response.success) {
      btn.innerHTML = '✓ Готово!';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 2000);
      
      // Обновляем время последней проверки
      settings = await StorageManager.getSettings();
      updateUI();
    } else {
      btn.innerHTML = '✗ Ошибка';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 2000);
    }
  } catch (error) {
    console.error('Ошибка при проверке:', error);
    btn.innerHTML = '✗ Ошибка';
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 2000);
  }
};

// Открытие настроек
const handleOpenSettings = () => {
  chrome.runtime.openOptionsPage();
};

// Автообновление времени каждые 10 секунд для более частого обновления
setInterval(async () => {
  settings = await StorageManager.getSettings();
  connectionStatus = await StorageManager.getConnectionStatus();
  updateLastCheckTime();
}, 10000); // каждые 10 секунд

// Слушаем изменения в storage для мгновенного обновления времени
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local') {
    if (changes.lastChecks) {
      console.log('Popup: получены изменения lastChecks из storage', changes.lastChecks.newValue);
      settings.lastChecks = changes.lastChecks.newValue;
      updateLastCheckTime();
    }
    // Обновляем статус подключения
    if (changes.connectionStatus) {
      console.log('Popup: статус подключения изменился', changes.connectionStatus.newValue);
      connectionStatus = changes.connectionStatus.newValue;
      updateUI();
    }
    // Обновляем весь UI если изменились настройки
    if (changes.enabled || changes.gitlabUrl || changes.gitlabToken || 
        changes.telegramBotToken || changes.telegramChatId || changes.projects) {
      console.log('Popup: настройки изменились, обновляем UI');
      settings = await StorageManager.getSettings();
      connectionStatus = await StorageManager.getConnectionStatus();
      updateUI();
    }
  }
});

// Event Listeners
document.addEventListener('DOMContentLoaded', initPopup);

document.getElementById('toggleSwitch').addEventListener('click', handleToggle);
document.getElementById('toggleSwitch').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handleToggle();
  }
});

document.getElementById('checkNowBtn').addEventListener('click', handleCheckNow);
document.getElementById('settingsBtn').addEventListener('click', handleOpenSettings);

