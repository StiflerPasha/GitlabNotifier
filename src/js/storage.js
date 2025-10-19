// Модуль для работы с Chrome Storage
export class StorageManager {
  // Инициализация хранилища с дефолтными значениями
  static async initialize() {
    const defaults = {
      enabled: true,
      gitlabUrl: '',
      gitlabToken: '',
      gitlabUsername: '',
      telegramBotToken: '',
      telegramChatId: '',
      projects: [],
      notifyMRComments: true,
      notifyPipelines: true,
      notifyOwnComments: false,
      showBrowserNotifications: true,
      checkInterval: 2,
      lastChecks: {
        mrComments: new Date(0).toISOString(),
        pipelines: new Date(0).toISOString()
      },
      pipelineStatuses: {},
      processedNotes: {},
      unreadCount: 0,
      connectionStatus: {
        available: true,
        lastCheck: new Date(0).toISOString(),
        error: null
      }
    };

    const stored = await chrome.storage.local.get(defaults);
    
    // Если нет сохраненных настроек, сохраняем дефолтные
    if (!stored.gitlabUrl) {
      await chrome.storage.local.set(defaults);
    }
  }

  // Получение всех настроек
  static async getSettings() {
    const data = await chrome.storage.local.get(null);
    return data;
  }

  // Сохранение настроек
  static async saveSettings(settings) {
    await chrome.storage.local.set(settings);
  }

  // Получение времени последней проверки
  static async getLastCheckTime(type) {
    const data = await chrome.storage.local.get('lastChecks');
    const lastChecks = data.lastChecks || {};
    return new Date(lastChecks[type] || 0);
  }

  // Сохранение времени последней проверки
  static async setLastCheckTime(type, date) {
    const data = await chrome.storage.local.get('lastChecks');
    const lastChecks = data.lastChecks || {};
    lastChecks[type] = date.toISOString();
    await chrome.storage.local.set({ lastChecks });
    console.log(`✓ Время последней проверки (${type}) обновлено: ${date.toLocaleString('ru-RU')}`);
  }

  // Получение сохраненных статусов пайплайнов
  static async getPipelineStatuses() {
    const data = await chrome.storage.local.get('pipelineStatuses');
    return data.pipelineStatuses || {};
  }

  // Сохранение статусов пайплайнов
  static async setPipelineStatuses(statuses) {
    await chrome.storage.local.set({ pipelineStatuses: statuses });
  }

  // Получение обработанных комментариев
  static async getProcessedNotes() {
    const data = await chrome.storage.local.get('processedNotes');
    return data.processedNotes || {};
  }

  // Проверка, был ли комментарий уже обработан
  static async isNoteProcessed(noteId) {
    const processedNotes = await this.getProcessedNotes();
    return !!processedNotes[noteId];
  }

  // Отметка комментария как обработанного
  static async markNoteAsProcessed(noteId) {
    const processedNotes = await this.getProcessedNotes();
    processedNotes[noteId] = Date.now();
    
    // Очищаем старые записи (старше 30 дней)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    Object.keys(processedNotes).forEach(id => {
      if (processedNotes[id] < thirtyDaysAgo) {
        delete processedNotes[id];
      }
    });
    
    await chrome.storage.local.set({ processedNotes });
  }

  // Получить количество непрочитанных уведомлений
  static async getUnreadCount() {
    const data = await chrome.storage.local.get('unreadCount');
    return data.unreadCount || 0;
  }

  // Увеличить счетчик непрочитанных
  static async incrementUnreadCount() {
    const count = await this.getUnreadCount();
    await chrome.storage.local.set({ unreadCount: count + 1 });
    return count + 1;
  }

  // Сбросить счетчик непрочитанных
  static async resetUnreadCount() {
    await chrome.storage.local.set({ unreadCount: 0 });
  }

  // Получить статус подключения
  static async getConnectionStatus() {
    const data = await chrome.storage.local.get('connectionStatus');
    return data.connectionStatus || {
      available: true,
      lastCheck: new Date(0).toISOString(),
      error: null
    };
  }

  // Сохранить статус подключения
  static async setConnectionStatus(available, error = null) {
    const connectionStatus = {
      available,
      lastCheck: new Date().toISOString(),
      error
    };
    await chrome.storage.local.set({ connectionStatus });
    console.log(`✓ Статус подключения обновлен: ${available ? 'доступен' : 'недоступен'}`, error || '');
  }

  // Очистка всех данных
  static async clear() {
    await chrome.storage.local.clear();
    await this.initialize();
  }
}

