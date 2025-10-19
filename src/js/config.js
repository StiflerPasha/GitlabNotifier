// Конфигурация расширения
export const CONFIG = {
  // Режим отладки (включает подробное логирование)
  DEBUG_MODE: false,
  
  // Интервалы проверки (в минутах)
  DEFAULT_CHECK_INTERVAL: 2,
  MIN_CHECK_INTERVAL: 1,
  MAX_CHECK_INTERVAL: 60,
  
  // Параллельная обработка
  PARALLEL_BATCH_SIZE: 10,
  
  // Лимиты для автоподбора проектов
  AUTO_SELECT_MAX_MRS: 20,
  AUTO_SELECT_MAX_PARTICIPANTS_CHECK: 5,
  
  // Время хранения данных
  PROCESSED_NOTES_RETENTION_DAYS: 30,
  PROJECTS_CACHE_TTL_HOURS: 24,
};

// Утилиты для логирования
export const logger = {
  log: (...args) => {
    if (CONFIG.DEBUG_MODE) {
      console.log('[GitLab Notifier]', ...args);
    }
  },
  
  error: (...args) => {
    console.error('[GitLab Notifier ERROR]', ...args);
  },
  
  warn: (...args) => {
    if (CONFIG.DEBUG_MODE) {
      console.warn('[GitLab Notifier WARN]', ...args);
    }
  },
  
  info: (...args) => {
    if (CONFIG.DEBUG_MODE) {
      console.info('[GitLab Notifier INFO]', ...args);
    }
  }
};

