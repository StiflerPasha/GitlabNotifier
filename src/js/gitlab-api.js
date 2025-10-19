// GitLab API модуль
export class GitLabAPI {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Убираем trailing slash
    this.token = token;
    this.apiUrl = `${this.baseUrl}/api/v4`;
  }

  // Выполнение запроса к GitLab API
  async makeRequest(endpoint, options = {}) {
    const url = `${this.apiUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'PRIVATE-TOKEN': this.token,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`GitLab API Error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  // Получение списка Merge Requests
  async getMergeRequests(projectId, state = 'opened', scope = null) {
    try {
      let endpoint = `/projects/${encodeURIComponent(projectId)}/merge_requests?state=${state}&order_by=updated_at&sort=desc&per_page=20`;
      
      // Добавляем scope если указан (created_by_me, assigned_to_me, all)
      if (scope) {
        endpoint += `&scope=${scope}`;
      }
      
      return await this.makeRequest(endpoint);
    } catch (error) {
      console.error('Ошибка получения MR:', error);
      return [];
    }
  }
  
  // Получение participants MR
  async getMRParticipants(projectId, mergeRequestIid) {
    try {
      return await this.makeRequest(
        `/projects/${encodeURIComponent(projectId)}/merge_requests/${mergeRequestIid}/participants`
      );
    } catch (error) {
      console.error(`Ошибка получения participants для MR !${mergeRequestIid}:`, error);
      return [];
    }
  }

  // Получение комментариев (notes) к MR
  async getMRNotes(projectId, mergeRequestIid) {
    try {
      const endpoint = `/projects/${encodeURIComponent(projectId)}/merge_requests/${mergeRequestIid}/notes?order_by=created_at&sort=desc&per_page=50`;
      return await this.makeRequest(endpoint);
    } catch (error) {
      console.error('Ошибка получения комментариев MR:', error);
      return [];
    }
  }

  // Получение списка пайплайнов
  async getPipelines(projectId, perPage = 20) {
    try {
      const endpoint = `/projects/${encodeURIComponent(projectId)}/pipelines?order_by=updated_at&sort=desc&per_page=${perPage}`;
      return await this.makeRequest(endpoint);
    } catch (error) {
      // Ошибка 403 обычно означает недостаточно прав для доступа к пайплайнам
      if (error.message.includes('403')) {
        console.warn(`Нет доступа к пайплайнам проекта ${projectId}. Возможно требуется scope 'api' вместо 'read_api' или отключены пайплайны в проекте.`);
      } else {
        console.error('Ошибка получения пайплайнов:', error);
      }
      return [];
    }
  }

  // Получение деталей пайплайна
  async getPipelineDetails(projectId, pipelineId) {
    try {
      const endpoint = `/projects/${encodeURIComponent(projectId)}/pipelines/${pipelineId}`;
      return await this.makeRequest(endpoint);
    } catch (error) {
      console.error('Ошибка получения деталей пайплайна:', error);
      return null;
    }
  }

  // Проверка подключения к GitLab
  async testConnection() {
    try {
      const endpoint = '/user';
      const user = await this.makeRequest(endpoint);
      return { success: true, user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Быстрая проверка доступности GitLab (для VPN)
  async checkAvailability() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд таймаут
      
      const response = await fetch(`${this.apiUrl}/version`, {
        method: 'GET',
        headers: {
          'PRIVATE-TOKEN': this.token
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return { available: true, error: null };
      } else {
        return { available: false, error: `HTTP ${response.status}` };
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return { available: false, error: 'Проверьте VPN подключение' };
      }
      return { available: false, error: error.message };
    }
  }

  // Получение списка проектов пользователя
  async getUserProjects() {
    try {
      const endpoint = '/projects?membership=true&order_by=last_activity_at&sort=desc&per_page=100';
      return await this.makeRequest(endpoint);
    } catch (error) {
      console.error('Ошибка получения проектов:', error);
      return [];
    }
  }
}

