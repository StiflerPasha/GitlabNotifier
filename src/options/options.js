// Options Page Script
import { StorageManager } from '../js/storage.js';
import { GitLabAPI } from '../js/gitlab-api.js';

let currentSettings = {};
let availableProjects = [];
let gitlabUsername = null; // Хранится в памяти после успешного теста подключения
let isGitLabTested = false; // Флаг успешного тестирования

// Инициализация страницы настроек
const initOptions = async () => {
  currentSettings = await StorageManager.getSettings();
  loadSettingsToForm();

  // Автоматически загружаем проекты, если настройки GitLab уже есть
  if (currentSettings.gitlabUrl && currentSettings.gitlabToken) {
    console.log('GitLab настроен, автоматически загружаем проекты');
    await autoLoadProjects();
  }
};

// Автоматическая загрузка проектов при открытии страницы
const autoLoadProjects = async () => {
  try {
    const gitlabApi = new GitLabAPI(currentSettings.gitlabUrl, currentSettings.gitlabToken);
    availableProjects = await gitlabApi.getUserProjects();

    if (availableProjects.length > 0) {
      // Заполняем кэш названий проектов
      const cache = {};
      availableProjects.forEach(project => {
        cache[project.id] = project.path_with_namespace || project.name_with_namespace || `Project ${project.id}`;
      });
      await StorageManager.setProjectNamesCache(cache);
      console.log(`✅ Кэш названий автоматически заполнен для ${availableProjects.length} проектов`);
      
      currentSettings = await StorageManager.getSettings();
      renderProjects();
      document.getElementById('projectsSearchContainer').style.display = 'block';
      document.getElementById('projectsStats').style.display = 'flex';
    }
  } catch (error) {
    console.error('Ошибка автозагрузки проектов:', error);
  }
};

// Загрузка настроек в форму
const loadSettingsToForm = () => {
  document.getElementById('gitlabUrl').value = currentSettings.gitlabUrl || '';
  document.getElementById('gitlabToken').value = currentSettings.gitlabToken || '';
  gitlabUsername = currentSettings.gitlabUsername || null;
  document.getElementById('telegramBotToken').value = currentSettings.telegramBotToken || '';
  document.getElementById('telegramChatId').value = currentSettings.telegramChatId || '';
  document.getElementById('notifyMRComments').checked = currentSettings.notifyMRComments !== false;
  document.getElementById('notifyPipelines').checked = currentSettings.notifyPipelines !== false;
  document.getElementById('notifyOwnComments').checked = !!currentSettings.notifyOwnComments;
  document.getElementById('showBrowserNotifications').checked = currentSettings.showBrowserNotifications !== false;
  document.getElementById('checkInterval').value = currentSettings.checkInterval || 2;

  // Если GitLab уже настроен и есть username, считаем что тест пройден
  if (currentSettings.gitlabUrl && currentSettings.gitlabToken && gitlabUsername) {
    isGitLabTested = true;
    updateGitLabTestStatus(true);
  }
};

// Обновление статуса успешного теста GitLab
const updateGitLabTestStatus = (success) => {
  const loadProjectsBtn = document.getElementById('loadProjectsBtn');

  if (success) {
    loadProjectsBtn.disabled = false;
    loadProjectsBtn.style.opacity = '1';
  } else {
    loadProjectsBtn.disabled = true;
    loadProjectsBtn.style.opacity = '0.5';
  }
};

// Сохранение настроек
const handleSaveSettings = async () => {
  if (!isGitLabTested) {
    showAlert('error', '⚠️ Сначала проверьте подключение к GitLab');
    return;
  }

  const btn = document.getElementById('saveBtn');
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '⏳ Сохраняем...';

  try {
    const selectedProjects = getSelectedProjects();

    const settings = {
      gitlabUrl: document.getElementById('gitlabUrl').value.trim(),
      gitlabToken: document.getElementById('gitlabToken').value.trim(),
      gitlabUsername: gitlabUsername, // Используем переменную из памяти
      telegramBotToken: document.getElementById('telegramBotToken').value.trim(),
      telegramChatId: document.getElementById('telegramChatId').value.trim(),
      notifyMRComments: document.getElementById('notifyMRComments').checked,
      notifyPipelines: document.getElementById('notifyPipelines').checked,
      notifyOwnComments: document.getElementById('notifyOwnComments').checked,
      showBrowserNotifications: document.getElementById('showBrowserNotifications').checked,
      checkInterval: parseInt(document.getElementById('checkInterval').value) || 2,
      projects: selectedProjects
    };

    await StorageManager.saveSettings(settings);
    currentSettings = await StorageManager.getSettings();

    showAlert('success', '✓ Настройки сохранены');
    btn.innerHTML = '✓ Сохранено';

    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 2000);

  } catch (error) {
    console.error('Ошибка сохранения:', error);
    showAlert('error', `✗ Ошибка сохранения: ${error.message}`);
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

// Получение выбранных проектов
const getSelectedProjects = () => {
  const checkboxes = document.querySelectorAll('.project-checkbox:checked');
  return Array.from(checkboxes).map(cb => String(cb.value));
};

// Тестирование подключения к GitLab
const handleTestGitLab = async () => {
  const btn = document.getElementById('testGitlabBtn');
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '⏳ Проверяем...';

  try {
    const url = document.getElementById('gitlabUrl').value.trim();
    const token = document.getElementById('gitlabToken').value.trim();

    if (!url || !token) {
      showAlert('error', '✗ Заполните URL и токен GitLab');
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }

    const gitlabApi = new GitLabAPI(url, token);
    const result = await gitlabApi.testConnection();

    if (result.success) {
      showAlert('success', `✓ Подключение успешно! Пользователь: ${result.user.name} (@${result.user.username})`);
      btn.innerHTML = '✓ Успешно!';

      // Сохраняем username в переменную
      gitlabUsername = result.user.username;
      isGitLabTested = true;

      // Сохраняем GitLab настройки
      await StorageManager.saveSettings({
        gitlabUrl: url,
        gitlabToken: token,
        gitlabUsername: gitlabUsername
      });
      currentSettings = await StorageManager.getSettings();

      // Активируем кнопку "Загрузить проекты"
      updateGitLabTestStatus(true);
    } else {
      showAlert('error', `✗ Ошибка подключения: ${result.error}`);
      btn.innerHTML = '✗ Ошибка';
      isGitLabTested = false;
      updateGitLabTestStatus(false);
    }

    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 2000);

  } catch (error) {
    console.error('Ошибка тестирования GitLab:', error);
    showAlert('error', `✗ Ошибка: ${error.message}`);
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

// Загрузка списка проектов
const handleLoadProjects = async () => {
  if (!isGitLabTested) {
    showAlert('error', '⚠️ Сначала проверьте подключение к GitLab');
    return;
  }

  const btn = document.getElementById('loadProjectsBtn');
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '⏳ Загружаем...';

  try {
    const url = document.getElementById('gitlabUrl').value.trim();
    const token = document.getElementById('gitlabToken').value.trim();

    if (!url || !token) {
      showAlert('error', '✗ Заполните URL и токен GitLab');
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }

    const gitlabApi = new GitLabAPI(url, token);
    availableProjects = await gitlabApi.getUserProjects();

    // Сохраняем GitLab настройки с username из переменной
    await StorageManager.saveSettings({
      gitlabUrl: url,
      gitlabToken: token,
      gitlabUsername: gitlabUsername
    });
    currentSettings = await StorageManager.getSettings();

    if (availableProjects.length === 0) {
      showAlert('info', 'ℹ Проекты не найдены');
      document.getElementById('projectsList').innerHTML = '<div class="loading-projects">Проекты не найдены</div>';
    } else {
      // Заполняем кэш названий проектов сразу после загрузки
      const cache = {};
      availableProjects.forEach(project => {
        cache[project.id] = project.path_with_namespace || project.name_with_namespace || `Project ${project.id}`;
      });
      await StorageManager.setProjectNamesCache(cache);
      console.log(`✅ Кэш названий заполнен для ${availableProjects.length} проектов`);
      
      renderProjects();
      showAlert('success', `✓ Загружено ${availableProjects.length} проектов`);
    }

    btn.innerHTML = '✓ Загружено!';
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 2000);

  } catch (error) {
    console.error('Ошибка загрузки проектов:', error);
    showAlert('error', `✗ Ошибка загрузки: ${error.message}`);
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

// Рендер списка проектов
const renderProjects = () => {
  const projectsList = document.getElementById('projectsList');
  const selectedProjects = currentSettings.projects || [];

  // Показываем поиск и статистику
  document.getElementById('projectsSearchContainer').classList.remove('hidden');
  document.getElementById('projectsStats').classList.remove('hidden');

  // Группируем проекты по namespace
  const projectsByNamespace = {};
  availableProjects.forEach(project => {
    const namespace = project.namespace?.name || project.namespace?.full_path || 'Без группы';
    if (!projectsByNamespace[namespace]) {
      projectsByNamespace[namespace] = [];
    }
    projectsByNamespace[namespace].push(project);
  });

  // Сортируем namespace: сначала с выбранными проектами, потом остальные
  const sortedNamespaces = Object.keys(projectsByNamespace).sort((a, b) => {
    const hasSelectedA = projectsByNamespace[a].some(p => selectedProjects.includes(String(p.id)));
    const hasSelectedB = projectsByNamespace[b].some(p => selectedProjects.includes(String(p.id)));

    // Если в одной группе есть выбранные, а в другой нет - группа с выбранными идет первой
    if (hasSelectedA && !hasSelectedB) return -1;
    if (!hasSelectedA && hasSelectedB) return 1;

    // Если обе группы одинаковые по статусу выбора - сортируем по имени
    return a.localeCompare(b);
  });

  // Генерируем HTML
  projectsList.innerHTML = sortedNamespaces.map(namespace => {
    const projects = projectsByNamespace[namespace];
    const namespaceId = namespace.replace(/\s+/g, '_').replace(/[^\w-]/g, '_');

    // Считаем выбранные проекты в группе
    const selectedInNamespace = projects.filter(p =>
      selectedProjects.includes(String(p.id))
    ).length;
    const hasSelected = selectedInNamespace > 0;

    // Сортируем проекты: выбранные сверху, затем по имени
    const sortedProjects = projects.sort((a, b) => {
      const isSelectedA = selectedProjects.includes(String(a.id));
      const isSelectedB = selectedProjects.includes(String(b.id));

      // Выбранные проекты идут первыми
      if (isSelectedA && !isSelectedB) return -1;
      if (!isSelectedA && isSelectedB) return 1;

      // Если оба выбраны или оба не выбраны - сортируем по имени
      return a.name.localeCompare(b.name);
    });

    return `
      <div class="namespace-group" data-namespace-id="${namespaceId}">
        <div class="namespace-header ${hasSelected ? 'has-selected' : ''}" data-namespace-id="${namespaceId}">
          <input 
            type="checkbox" 
            class="checkbox namespace-checkbox" 
            id="namespace_checkbox_${namespaceId}"
            data-namespace-id="${namespaceId}"
            ${selectedInNamespace === projects.length ? 'checked' : ''}
            style="margin-right: 8px;"
          />
          <span>📁 ${namespace}</span>
          <span class="namespace-count">(${projects.length})</span>
          ${hasSelected ? `<span class="namespace-selected">✓ ${selectedInNamespace}</span>` : ''}
          <span class="namespace-toggle collapsed" id="toggle_${namespaceId}">▼</span>
        </div>
        <div class="namespace-projects collapsed" id="projects_${namespaceId}">
          ${sortedProjects.map(project => {
            const isSelected = selectedProjects.includes(String(project.id));
            return `
              <div class="project-item ${isSelected ? 'selected' : ''}" data-project-id="${project.id}">
                <input 
                  type="checkbox" 
                  class="project-checkbox" 
                  value="${project.id}" 
                  id="project_${project.id}"
                  ${isSelected ? 'checked' : ''}
                />
                <div class="project-info">
                  <div class="project-name" title="${project.name_with_namespace}">${project.name}</div>
                  <div class="project-meta">
                    <span class="project-meta-item">⭐ ${project.star_count || 0}</span>
                    <span class="project-meta-item">🔀 ${project.forks_count || 0}</span>
                    ${project.visibility ? `<span class="project-meta-item">🔒 ${project.visibility}</span>` : ''}
                  </div>
                </div>
                <span class="project-id" title="ID проекта в GitLab">#${project.id}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Обновляем статистику
  updateProjectStats();

  // Добавляем поиск
  setupProjectsSearch();

  // Добавляем обработчики кликов
  setupProjectsClickHandlers();

  // Инициализируем состояние чекбоксов групп
  initializeNamespaceCheckboxes();
};

// Инициализация состояния чекбоксов групп после загрузки
const initializeNamespaceCheckboxes = () => {
  document.querySelectorAll('.namespace-group').forEach(group => {
    const namespaceCheckbox = group.querySelector('.namespace-checkbox');
    const projectCheckboxes = group.querySelectorAll('.project-checkbox');
    const checkedInGroup = group.querySelectorAll('.project-checkbox:checked').length;
    const totalInGroup = projectCheckboxes.length;

    if (namespaceCheckbox) {
      if (checkedInGroup === 0) {
        namespaceCheckbox.checked = false;
        namespaceCheckbox.indeterminate = false;
      } else if (checkedInGroup === totalInGroup) {
        namespaceCheckbox.checked = true;
        namespaceCheckbox.indeterminate = false;
      } else {
        namespaceCheckbox.checked = false;
        namespaceCheckbox.indeterminate = true;
      }
    }
  });
};

// Настройка обработчиков кликов для проектов
const setupProjectsClickHandlers = () => {
  // Обработчики для чекбоксов групп (выбрать все в группе)
  document.querySelectorAll('.namespace-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      const namespaceId = checkbox.getAttribute('data-namespace-id');
      const group = document.querySelector(`.namespace-group[data-namespace-id="${namespaceId}"]`);
      const projectCheckboxes = group.querySelectorAll('.project-checkbox');

      projectCheckboxes.forEach(projectCheckbox => {
        projectCheckbox.checked = checkbox.checked;
      });

      updateProjectSelection();
    });
  });

  // Обработчики для заголовков групп (сворачивание/разворачивание)
  document.querySelectorAll('.namespace-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // Игнорируем клик по чекбоксу
      if (e.target.classList.contains('namespace-checkbox')) {
        return;
      }

      const namespaceId = header.getAttribute('data-namespace-id');
      const projectsContainer = document.getElementById(`projects_${namespaceId}`);
      const toggle = document.getElementById(`toggle_${namespaceId}`);

      if (projectsContainer && toggle) {
        projectsContainer.classList.toggle('collapsed');
        toggle.classList.toggle('collapsed');
      }
    });
  });

  // Обработчики для проектов (выбор/отмена)
  document.querySelectorAll('.project-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Игнорируем клик если это чекбокс
      if (e.target.classList.contains('project-checkbox')) {
        return;
      }

      const projectId = item.getAttribute('data-project-id');
      const checkbox = document.getElementById(`project_${projectId}`);

      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        updateProjectSelection();
      }
    });
  });

  // Обработчики для чекбоксов
  document.querySelectorAll('.project-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      updateProjectSelection();
    });
  });
};

// Обновление выбора проектов
const updateProjectSelection = () => {
  const checkboxes = document.querySelectorAll('.project-checkbox');
  checkboxes.forEach(cb => {
    const projectItem = cb.closest('.project-item');
    if (cb.checked) {
      projectItem.classList.add('selected');
    } else {
      projectItem.classList.remove('selected');
    }
  });
  updateProjectStats();
  updateNamespaceHeaders();
};

// Обновление заголовков групп (показ выбранных)
const updateNamespaceHeaders = () => {
  const projectsList = document.getElementById('projectsList');
  const groups = Array.from(projectsList.querySelectorAll('.namespace-group'));

  // Обновляем заголовки и считаем выбранные
  groups.forEach(group => {
    const header = group.querySelector('.namespace-header');
    const selectedCount = group.querySelectorAll('.project-checkbox:checked').length;

    // Сохраняем количество выбранных как data-атрибут для сортировки
    group.setAttribute('data-selected-count', selectedCount);

    // Обновляем класс has-selected
    if (selectedCount > 0) {
      header.classList.add('has-selected');
    } else {
      header.classList.remove('has-selected');
    }

    // Обновляем счетчик выбранных
    const existingBadge = header.querySelector('.namespace-selected');
    if (selectedCount > 0) {
      if (existingBadge) {
        existingBadge.textContent = `✓ ${selectedCount}`;
      } else {
        const toggle = header.querySelector('.namespace-toggle');
        const badge = document.createElement('span');
        badge.className = 'namespace-selected';
        badge.textContent = `✓ ${selectedCount}`;
        header.insertBefore(badge, toggle);
      }
    } else if (existingBadge) {
      existingBadge.remove();
    }

    // Обновляем чекбокс группы
    const namespaceCheckbox = group.querySelector('.namespace-checkbox');
    const projectCheckboxes = group.querySelectorAll('.project-checkbox');
    const checkedInGroup = group.querySelectorAll('.project-checkbox:checked').length;
    const totalInGroup = projectCheckboxes.length;

    if (namespaceCheckbox) {
      if (checkedInGroup === 0) {
        namespaceCheckbox.checked = false;
        namespaceCheckbox.indeterminate = false;
      } else if (checkedInGroup === totalInGroup) {
        namespaceCheckbox.checked = true;
        namespaceCheckbox.indeterminate = false;
      } else {
        namespaceCheckbox.checked = false;
        namespaceCheckbox.indeterminate = true;
      }
    }

    // Пересортировываем проекты внутри группы: выбранные сверху
    const projectsContainer = group.querySelector('.namespace-projects');
    const projectItems = Array.from(projectsContainer.querySelectorAll('.project-item'));

    projectItems.sort((a, b) => {
      const isSelectedA = a.querySelector('.project-checkbox').checked;
      const isSelectedB = b.querySelector('.project-checkbox').checked;

      // Выбранные проекты идут первыми
      if (isSelectedA && !isSelectedB) return -1;
      if (!isSelectedA && isSelectedB) return 1;

      // Если оба выбраны или оба не выбраны - сохраняем порядок
      return 0;
    });

    // Перестраиваем DOM проектов
    projectItems.forEach(item => projectsContainer.appendChild(item));
  });

  // Пересортировываем группы: с выбранными наверх
  groups.sort((a, b) => {
    const hasSelectedA = parseInt(a.getAttribute('data-selected-count')) > 0;
    const hasSelectedB = parseInt(b.getAttribute('data-selected-count')) > 0;

    // Если в одной группе есть выбранные, а в другой нет - группа с выбранными идет первой
    if (hasSelectedA && !hasSelectedB) return -1;
    if (!hasSelectedA && hasSelectedB) return 1;

    // Если обе группы одинаковые - сохраняем текущий порядок
    return 0;
  });

  // Перестраиваем DOM
  groups.forEach(group => projectsList.appendChild(group));
};

// Обновление статистики
const updateProjectStats = () => {
  const total = availableProjects.length;
  const selected = document.querySelectorAll('.project-checkbox:checked').length;

  document.getElementById('totalProjects').textContent = total;
  document.getElementById('selectedProjects').textContent = selected;
};

// Настройка поиска проектов
const setupProjectsSearch = () => {
  const searchInput = document.getElementById('projectsSearch');

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const projects = document.querySelectorAll('.project-item');
    const namespaces = document.querySelectorAll('.namespace-group');

    projects.forEach(project => {
      const name = project.querySelector('.project-name').textContent.toLowerCase();
      const matches = name.includes(query);
      project.style.display = matches ? 'flex' : 'none';
    });

    // Скрываем пустые namespace
    namespaces.forEach(namespace => {
      const visibleProjects = namespace.querySelectorAll('.project-item[style="display: flex;"], .project-item:not([style])');
      namespace.style.display = visibleProjects.length > 0 ? 'block' : 'none';
    });
  });
};


// Тестирование подключения к Telegram
const handleTestTelegram = async () => {
  const btn = document.getElementById('testTelegramBtn');
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '⏳ Проверяем...';

  try {
    const botToken = document.getElementById('telegramBotToken').value.trim();
    const chatId = document.getElementById('telegramChatId').value.trim();

    if (!botToken || !chatId) {
      showAlert('error', '✗ Заполните Bot Token и Chat ID');
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }

    const result = await chrome.runtime.sendMessage({
      action: 'testTelegram',
      botToken: botToken,
      chatId: chatId
    });

    if (result.success) {
      showAlert('success', '✓ Тестовое сообщение отправлено в Telegram!');
      btn.innerHTML = '✓ Успешно!';
    } else {
      showAlert('error', `✗ Ошибка: ${result.error}`);
      btn.innerHTML = '✗ Ошибка';
    }

    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 2000);

  } catch (error) {
    console.error('Ошибка тестирования Telegram:', error);
    showAlert('error', `✗ Ошибка: ${error.message}`);
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

// Сброс настроек
const handleReset = async () => {
  if (!confirm('Вы уверены, что хотите сбросить все настройки к дефолтным значениям?')) {
    return;
  }

  try {
    await StorageManager.clear();
    currentSettings = await StorageManager.getSettings();
    loadSettingsToForm();
    document.getElementById('projectsList').innerHTML = '<div class="loading-projects">Нажмите "Загрузить проекты" после настройки GitLab</div>';
    showAlert('success', '✓ Настройки сброшены к дефолтным значениям');
  } catch (error) {
    console.error('Ошибка сброса:', error);
    showAlert('error', `✗ Ошибка сброса: ${error.message}`);
  }
};

// Показать alert
const showAlert = (type, message) => {
  // Скрываем все алерты
  document.querySelectorAll('.alert').forEach(alert => {
    alert.classList.remove('show');
  });

  // Показываем нужный
  const alertId = `alert${type.charAt(0).toUpperCase() + type.slice(1)}`;
  const alert = document.getElementById(alertId);
  if (alert) {
    alert.textContent = message;
    alert.classList.add('show');

    // Автоматически скрываем через 5 секунд
    setTimeout(() => {
      alert.classList.remove('show');
    }, 5000);
  }
};

// Переключение видимости токена
const togglePasswordVisibility = (inputId, buttonId) => {
  const input = document.getElementById(inputId);
  const button = document.getElementById(buttonId);

  if (input.type === 'password') {
    input.type = 'text';
    button.innerHTML = '🔓';
    button.style.color = '#22c55e';
  } else {
    input.type = 'password';
    button.innerHTML = '🔒';
    button.style.color = '#6b7280';
  }
};


// Проверка причастности к одному проекту
const checkProjectRelation = async (project, username, gitlabApi) => {
  // Проверяем базовые признаки причастности (быстро, без API запросов)
  const hasBasicAccess =
    project.owner?.username === username ||
    project.namespace?.owner?.username === username ||
    project.permissions?.project_access?.access_level > 0 ||
    project.permissions?.group_access?.access_level > 0 ||
    project.creator_id === username;

  if (hasBasicAccess) {
    return true;
  }

  // Проверяем наличие открытых MR, где пользователь участвует
  try {
    const mergeRequests = await gitlabApi.getMergeRequests(project.id, 'opened');

    // Проверяем только первые 20 MR для ускорения
    const mrsToCheck = mergeRequests.slice(0, 20);

    for (const mr of mrsToCheck) {
      // Сначала проверяем базовые роли (без дополнительных запросов)
      const isRelatedToMR =
        mr.author?.username === username ||
        mr.assignee?.username === username ||
        mr.assignees?.some(a => a.username === username) ||
        mr.reviewers?.some(r => r.username === username);

      if (isRelatedToMR) {
        return true;
      }
    }

    // Проверяем participants только у первых 5 MR (это медленно)
    for (const mr of mrsToCheck.slice(0, 5)) {
      try {
        const participants = await gitlabApi.getMRParticipants(project.id, mr.iid);
        if (participants.some(p => p.username === username)) {
          return true;
        }
      } catch (error) {
        // Игнорируем ошибки проверки participants
      }
    }
  } catch (error) {
    // Игнорируем ошибки получения MR
  }

  return false;
};

// Автовыбор проектов, к которым пользователь причастен
const handleAutoSelectMyProjects = async () => {
  if (!availableProjects || availableProjects.length === 0) {
    showAlert('error', '✗ Сначала загрузите проекты');
    return;
  }

  // Используем username из переменной памяти
  if (!gitlabUsername) {
    showAlert('error', '✗ Сначала проверьте подключение к GitLab');
    return;
  }

  const username = gitlabUsername;

  const btn = document.getElementById('autoSelectMyProjectsBtn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Проверка проектов...';

  try {
    // Берем URL и токен из полей ввода или сохраненных настроек
    const gitlabUrl = document.getElementById('gitlabUrl').value.trim() || currentSettings.gitlabUrl;
    const gitlabToken = document.getElementById('gitlabToken').value.trim() || currentSettings.gitlabToken;

    if (!gitlabUrl || !gitlabToken) {
      showAlert('error', '✗ Укажите GitLab URL и токен');
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    const gitlabApi = new GitLabAPI(gitlabUrl, gitlabToken);
    let selectedCount = 0;

    showAlert('info', `🔍 Проверка ${availableProjects.length} проектов (параллельно)...`);

    // Фильтруем только непроверенные проекты
    const projectsToCheck = availableProjects.filter(project => {
      const checkbox = document.getElementById(`project_${project.id}`);
      return checkbox && !checkbox.checked;
    });

    // Обрабатываем проекты пакетами по 10 одновременно (для ускорения)
    const batchSize = 10;
    const batches = [];

    for (let i = 0; i < projectsToCheck.length; i += batchSize) {
      batches.push(projectsToCheck.slice(i, i + batchSize));
    }

    let processed = 0;

    for (const batch of batches) {
      // Проверяем проекты в пакете параллельно
      const results = await Promise.allSettled(
        batch.map(project => checkProjectRelation(project, username, gitlabApi))
      );

      // Обрабатываем результаты
      results.forEach((result, index) => {
        processed++;
        btn.innerHTML = `⏳ ${processed}/${projectsToCheck.length}`;

        if (result.status === 'fulfilled' && result.value === true) {
          const project = batch[index];
          const checkbox = document.getElementById(`project_${project.id}`);
          if (checkbox) {
            checkbox.checked = true;
            selectedCount++;
          }
        }
      });

      // Обновляем UI после каждого пакета
      updateProjectSelection();
    }

    showAlert('success', `✓ Автоматически выбрано проектов: ${selectedCount} из ${availableProjects.length}`);

  } catch (error) {
    console.error('Ошибка автовыбора:', error);
    showAlert('error', `✗ Ошибка автовыбора: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
};

// Event Listeners
document.addEventListener('DOMContentLoaded', initOptions);
document.getElementById('saveBtn').addEventListener('click', handleSaveSettings);
document.getElementById('testGitlabBtn').addEventListener('click', handleTestGitLab);
document.getElementById('loadProjectsBtn').addEventListener('click', handleLoadProjects);
document.getElementById('autoSelectMyProjectsBtn').addEventListener('click', handleAutoSelectMyProjects);
document.getElementById('testTelegramBtn').addEventListener('click', handleTestTelegram);
document.getElementById('resetBtn').addEventListener('click', handleReset);
document.getElementById('toggleGitlabToken').addEventListener('click', () => {
  togglePasswordVisibility('gitlabToken', 'toggleGitlabToken');
});
document.getElementById('toggleTelegramBotToken').addEventListener('click', () => {
  togglePasswordVisibility('telegramBotToken', 'toggleTelegramBotToken');
});

