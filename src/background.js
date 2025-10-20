// Background Service Worker для GitLab Notifier
import { GitLabAPI } from './js/gitlab-api.js';
import { TelegramAPI } from './js/telegram-api.js';
import { StorageManager } from './js/storage.js';
import { logger } from './js/config.js';

// Инициализация при установке расширения
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('GitLab Notifier установлен');
  
  // Инициализируем storage
  await StorageManager.initialize();
  
  // Создаем alarm для периодической проверки
  await setupAlarm();
  
  // Инициализируем badge
  await updateBadge();
  
  // Миграция для предотвращения уведомлений о старых комментариях
  // Работает как при первой установке, так и при обновлении
  if (details.reason === 'install' || details.reason === 'update') {
    const processedNotes = await StorageManager.getProcessedNotes();
    if (Object.keys(processedNotes).length === 0) {
      console.log('Инициализация: устанавливаем lastCheck на текущее время для предотвращения уведомлений о старых комментариях');
      const now = new Date();
      await StorageManager.setLastCheckTime('mrComments', now);
      await StorageManager.setLastCheckTime('pipelines', now);
    }
  }
});

// Настройка alarm с учетом пользовательского интервала
const setupAlarm = async () => {
  const settings = await StorageManager.getSettings();
  const intervalMinutes = settings.checkInterval || 2;
  
  // Удаляем старый alarm
  await chrome.alarms.clear('checkGitLab');
  
  // Создаем новый с актуальным интервалом и немедленным первым запуском
  chrome.alarms.create('checkGitLab', {
    delayInMinutes: 0.1, // Первый запуск через 6 секунд
    periodInMinutes: intervalMinutes
  });
  
  console.log(`Alarm настроен на ${intervalMinutes} минут с немедленным первым запуском`);
};

// Обновление badge с количеством непрочитанных уведомлений
const updateBadge = async () => {
  const count = await StorageManager.getUnreadCount();
  if (count > 0) {
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // Красный цвет
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
};

// Слушаем изменения в storage для обновления интервала и badge
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local' && changes.checkInterval) {
    console.log(`Интервал изменен на ${changes.checkInterval.newValue} минут`);
    await setupAlarm();
  }
  
  // Обновляем badge при изменении счетчика
  if (namespace === 'local' && changes.unreadCount) {
    await updateBadge();
  }
});

// Слушаем alarm для проверки
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkGitLab') {
    console.log(`⏰ Alarm "${alarm.name}" сработал в ${new Date().toLocaleString('ru-RU')}, запускаем проверку GitLab`);
    await checkGitLabActivity();
  }
});

// Проверяем alarm при старте service worker
chrome.runtime.onStartup.addListener(async () => {
  console.log('Service Worker запущен');
  
  // Проверяем, существует ли alarm
  const alarm = await chrome.alarms.get('checkGitLab');
  if (!alarm) {
    console.log('Alarm не найден, создаем заново');
    await setupAlarm();
  } else {
    console.log(`Alarm найден, интервал: ${alarm.periodInMinutes} минут`);
  }
  
  // Обновляем badge
  await updateBadge();
  
  // Запускаем немедленную проверку при старте браузера
  console.log('Запускаем немедленную проверку при старте браузера');
  await checkGitLabActivity();
});

// Основная функция проверки активности
const checkGitLabActivity = async () => {
  const startTime = new Date();
  logger.log('=== Начало проверки GitLab ===', startTime.toLocaleString('ru-RU'));
  
  try {
    const settings = await StorageManager.getSettings();
    
    if (!settings.gitlabUrl || !settings.gitlabToken) {
      logger.info('GitLab не настроен');
      return;
    }
    
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      logger.info('Telegram не настроен');
      return;
    }
    
    if (!settings.enabled) {
      logger.info('Уведомления отключены');
      return;
    }
    
    logger.log(`Настройки: MR комментарии=${settings.notifyMRComments}, Пайплайны=${settings.notifyPipelines}, Проектов=${settings.projects?.length || 0}`);
    
    const gitlabApi = new GitLabAPI(settings.gitlabUrl, settings.gitlabToken);
    
    // Проверяем доступность GitLab (VPN)
    logger.log('Проверяем доступность GitLab...');
    const availability = await gitlabApi.checkAvailability();
    
    if (!availability.available) {
      logger.error('❌ GitLab недоступен:', availability.error);
      await StorageManager.setConnectionStatus(false, availability.error);
      return;
    }
    
    logger.log('✅ GitLab доступен');
    await StorageManager.setConnectionStatus(true, null);
    
    const telegramApi = new TelegramAPI(settings.telegramBotToken, settings.telegramChatId);
    
    // Проверяем комментарии в MR
    if (settings.notifyMRComments) {
      logger.log('Проверяем комментарии в MR...');
      await checkMRComments(gitlabApi, telegramApi, settings);
    }
    
    // Проверяем пайплайны
    if (settings.notifyPipelines) {
      logger.log('Проверяем пайплайны...');
      await checkPipelines(gitlabApi, telegramApi, settings);
    }
    
    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    logger.log(`=== Проверка GitLab завершена за ${duration}с ===`, endTime.toLocaleString('ru-RU'));
    
  } catch (error) {
    logger.error('Ошибка при проверке GitLab:', error);
    await StorageManager.setConnectionStatus(false, error.message);
  }
};

// Проверка, связан ли пользователь с MR (быстрая проверка)
const isUserRelatedToMRBasic = (mr, username) => {
  if (!username) return 'yes';
  
  // Проверяем основные роли
  if (mr.author?.username === username) return 'yes';
  if (mr.assignee?.username === username) return 'yes';
  if (mr.assignees?.some(a => a.username === username)) return 'yes';
  if (mr.reviewers?.some(r => r.username === username)) return 'yes';
  
  // Нужна проверка participants через API
  return 'unknown';
};


// Проверка комментариев в Merge Requests
const checkMRComments = async (gitlabApi, telegramApi, settings) => {
  try {
    // Используем время из предыдущей успешной проверки, а не текущее
    const data = await chrome.storage.local.get('lastChecks');
    const lastChecks = data.lastChecks || {};
    const lastCheck = new Date(lastChecks.mrComments || 0);
    const projects = settings.projects || [];
    const username = settings.gitlabUsername;
    
    if (projects.length === 0) {
      console.log('Нет настроенных проектов');
      return;
    }
    
    let hasNewComments = false;
    let totalMRsChecked = 0;
    let relevantMRsCount = 0;
    
    for (const projectId of projects) {
      // Получаем открытые MR
      const mergeRequests = await gitlabApi.getMergeRequests(projectId, 'opened');
      totalMRsChecked += mergeRequests.length;
      
      for (const mr of mergeRequests) {
        // Быстрая проверка основных ролей
        const basicCheck = isUserRelatedToMRBasic(mr, username);
        
        let isRelated = basicCheck === 'yes';
        
        // Если не найден в основных ролях, проверяем participants
        if (!isRelated && basicCheck === 'unknown') {
          try {
            const participants = await gitlabApi.getMRParticipants(projectId, mr.iid);
            isRelated = participants.some(p => p.username === username);
          } catch (error) {
            console.error(`Ошибка проверки participants для MR !${mr.iid}:`, error);
          }
        }
        
        if (!isRelated) continue;
        
        relevantMRsCount++;
        
        // Получаем комментарии к MR
        const notes = await gitlabApi.getMRNotes(projectId, mr.iid);
        
        // Обрабатываем новые комментарии
        for (const note of notes) {
          const noteDate = new Date(note.created_at);
          const now = new Date();
          const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
          
          // Фильтрация
          if (noteDate <= lastCheck) continue;
          if (noteDate < sevenDaysAgo) continue; // Игнорируем комментарии старше 7 дней
          if (!settings.notifyOwnComments && note.author.username === settings.gitlabUsername) continue;
          if (await StorageManager.isNoteProcessed(note.id)) continue;
          
          // Отправка уведомления
          try {
            const message = formatMRCommentMessage(mr, note, settings.gitlabUrl, projectId);
            await telegramApi.sendMessage(message);
            
            if (settings.showBrowserNotifications) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: '../assets/icons/icon.png',
                title: 'Новый комментарий в MR',
                message: `${note.author.name}: ${note.body.substring(0, 100)}...`
              });
            }
            
            await StorageManager.markNoteAsProcessed(note.id);
            await StorageManager.incrementUnreadCount();
            hasNewComments = true;
          } catch (error) {
            console.error(`Ошибка отправки уведомления о комментарии ${note.id}:`, error);
          }
        }
      }
    }
    
    console.log(`MR: проверено ${totalMRsChecked}, релевантных ${relevantMRsCount}`);
    
    // Обновляем время последней проверки только после успешной проверки
    await StorageManager.setLastCheckTime('mrComments', new Date());
    
  } catch (error) {
    console.error('Ошибка при проверке комментариев MR:', error);
    // При ошибке НЕ обновляем lastCheck, чтобы не потерять комментарии
  }
};

// Проверка, связан ли пользователь с Pipeline
const isUserRelatedToPipeline = (pipeline, username) => {
  return !username || pipeline.user?.username === username;
};

// Проверка статусов пайплайнов
const checkPipelines = async (gitlabApi, telegramApi, settings) => {
  try {
    // Используем время из предыдущей успешной проверки, а не текущее
    const data = await chrome.storage.local.get('lastChecks');
    const lastChecks = data.lastChecks || {};
    const lastCheck = new Date(lastChecks.pipelines || 0);
    const projects = settings.projects || [];
    const username = settings.gitlabUsername;
    
    // Финальные статусы пайплайнов, о которых нужно уведомлять
    const finalStatuses = ['success', 'failed', 'canceled'];
    
    let totalPipelinesChecked = 0;
    let relevantPipelinesCount = 0;
    
    for (const projectId of projects) {
      // Получаем последние пайплайны
      const pipelines = await gitlabApi.getPipelines(projectId);
      
      // Фильтруем пайплайны: только финальные статусы и изменившиеся после последней проверки
      const recentPipelines = pipelines.filter(pipeline => {
        const updatedDate = new Date(pipeline.updated_at);
        const isFinalStatus = finalStatuses.includes(pipeline.status);
        return updatedDate > lastCheck && isFinalStatus;
      });
      
      totalPipelinesChecked += recentPipelines.length;
      
      // Получаем сохраненные статусы пайплайнов
      const savedStatuses = await StorageManager.getPipelineStatuses();
      
      for (const pipeline of recentPipelines) {
        if (!isUserRelatedToPipeline(pipeline, username)) continue;
        
        relevantPipelinesCount++;
        const pipelineKey = `${projectId}_${pipeline.id}`;
        const savedStatus = savedStatuses[pipelineKey];
        
        // Уведомление только при изменении статуса на финальный
        // (не уведомляем, если пайплайн сразу создался с финальным статусом)
        if (savedStatus && savedStatus !== pipeline.status) {
          console.log(`Pipeline #${pipeline.id}: статус изменился ${savedStatus} → ${pipeline.status}`);
          
          await telegramApi.sendMessage(
            formatPipelineMessage(pipeline, settings.gitlabUrl, projectId)
          );
          
          if (settings.showBrowserNotifications) {
            const statusTitles = {
              'success': '✅ Pipeline успешен',
              'failed': '❌ Pipeline провален',
              'canceled': '🚫 Pipeline отменён'
            };
            chrome.notifications.create({
              type: 'basic',
              iconUrl: '../assets/icons/icon.png',
              title: statusTitles[pipeline.status] || `Pipeline: ${pipeline.status}`,
              message: `Проект: ${projectId}\nВетка: ${pipeline.ref}`
            });
          }
          
          await StorageManager.incrementUnreadCount();
        }
        
        // Сохраняем статус для отслеживания изменений
        savedStatuses[pipelineKey] = pipeline.status;
      }
      
      await StorageManager.setPipelineStatuses(savedStatuses);
    }
    
    console.log(`Pipelines: проверено ${totalPipelinesChecked} с финальными статусами (success/failed/canceled), релевантных ${relevantPipelinesCount}`);
    
    // Обновляем время последней проверки только после успешной проверки
    await StorageManager.setLastCheckTime('pipelines', new Date());
    
  } catch (error) {
    console.error('Ошибка при проверке пайплайнов:', error);
    // При ошибке НЕ обновляем lastCheck, чтобы не потерять события
  }
};

// Форматирование сообщения о комментарии в MR
const formatMRCommentMessage = (mr, note, gitlabUrl, projectId) => {
  // Используем web_url из объекта MR или строим корректный URL через path_with_namespace
  const mrUrl = mr.web_url || `${gitlabUrl}/${mr.references?.full || ''}/-/merge_requests/${mr.iid}`;
  const commentUrl = `${mrUrl}#note_${note.id}`;
  
  // Определяем эмодзи статуса MR
  const statusEmoji = {
    'opened': '🟢',
    'merged': '🟣',
    'closed': '🔴'
  }[mr.state] || '⚪';
  
  // Форматируем дату комментария
  const commentDate = new Date(note.created_at);
  const timeStr = commentDate.toLocaleString('ru-RU', { 
    day: '2-digit', 
    month: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  // Обрезаем комментарий и добавляем многоточие
  let commentText = note.body.trim();
  if (commentText.length > 300) {
    commentText = commentText.substring(0, 300) + '...';
  }
  
  // Получаем название проекта
  const projectName = mr.references?.full?.split('!')[0]?.trim() || `Project ${projectId}`;
  
  return `
💬 <b>Новый комментарий в Merge Request</b>

${statusEmoji} <b>MR:</b> <a href="${mrUrl}">!${mr.iid} ${mr.title}</a>
📁 <b>Проект:</b> <code>${projectName}</code>
👤 <b>Автор MR:</b> ${mr.author?.name || 'Unknown'}
💭 <b>Комментарий от:</b> ${note.author.name}
🕒 <b>Время:</b> ${timeStr}

<b>📝 Текст комментария:</b>
<i>${commentText}</i>

<a href="${commentUrl}">➡️ Перейти к комментарию</a>
  `.trim();
};

// Форматирование сообщения о пайплайне
const formatPipelineMessage = (pipeline, gitlabUrl, projectId) => {
  // Используем web_url из объекта Pipeline
  const pipelineUrl = pipeline.web_url || `${gitlabUrl}/-/pipelines/${pipeline.id}`;
  
  // Определяем эмодзи и текст статуса
  const statusInfo = {
    'success': { emoji: '✅', text: 'УСПЕШНО', color: '🟢' },
    'failed': { emoji: '❌', text: 'ОШИБКА', color: '🔴' },
    'running': { emoji: '🔄', text: 'ВЫПОЛНЯЕТСЯ', color: '🔵' },
    'pending': { emoji: '⏳', text: 'ОЖИДАЕТ', color: '🟡' },
    'canceled': { emoji: '🚫', text: 'ОТМЕНЁН', color: '⚫' },
    'skipped': { emoji: '⏭️', text: 'ПРОПУЩЕН', color: '⚪' },
    'manual': { emoji: '👆', text: 'РУЧНОЙ ЗАПУСК', color: '🟠' }
  }[pipeline.status] || { emoji: '📊', text: pipeline.status.toUpperCase(), color: '⚪' };
  
  // Форматируем дату
  const pipelineDate = new Date(pipeline.updated_at);
  const timeStr = pipelineDate.toLocaleString('ru-RU', { 
    day: '2-digit', 
    month: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  // Определяем источник
  const source = pipeline.source || 'unknown';
  const sourceEmoji = {
    'push': '📤',
    'web': '🌐',
    'schedule': '⏰',
    'api': '🔧',
    'merge_request_event': '🔀',
    'trigger': '⚡'
  }[source] || '📋';
  
  return `
${statusInfo.emoji} <b>Pipeline: ${statusInfo.text}</b>

📁 <b>Проект:</b> <code>ID ${projectId}</code>
🔢 <b>Pipeline:</b> <a href="${pipelineUrl}">#${pipeline.id}</a>
🌿 <b>Ветка:</b> <code>${pipeline.ref}</code>
💾 <b>Коммит:</b> <code>${pipeline.sha?.substring(0, 8) || 'N/A'}</code>
${sourceEmoji} <b>Источник:</b> ${source}
👤 <b>Автор:</b> ${pipeline.user?.name || 'N/A'}
🕒 <b>Обновлён:</b> ${timeStr}

<a href="${pipelineUrl}">➡️ Открыть pipeline</a>
  `.trim();
};

// Слушаем сообщения из popup или options
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkNow') {
    checkGitLabActivity().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Асинхронный ответ
  }
  
  if (message.action === 'testTelegram') {
    testTelegramConnection(message.botToken, message.chatId).then((result) => {
      sendResponse(result);
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// Тестирование подключения к Telegram
const testTelegramConnection = async (botToken, chatId) => {
  try {
    const telegramApi = new TelegramAPI(botToken, chatId);
    await telegramApi.sendMessage('🎉 <b>Тест подключения успешен!</b>\n\nGitLab Notifier настроен правильно.');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

