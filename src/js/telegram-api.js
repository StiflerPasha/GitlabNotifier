// Telegram Bot API модуль
export class TelegramAPI {
  constructor(botToken, chatId) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.apiUrl = `https://api.telegram.org/bot${botToken}`;
  }

  // Отправка сообщения в Telegram
  async sendMessage(text, options = {}) {
    try {
      const response = await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...options
        })
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(`Telegram API Error: ${data.description}`);
      }

      return data;
    } catch (error) {
      console.error('Ошибка отправки в Telegram:', error);
      throw error;
    }
  }

  // Проверка подключения к боту
  async testConnection() {
    try {
      const response = await fetch(`${this.apiUrl}/getMe`);
      const data = await response.json();

      if (!data.ok) {
        return { success: false, error: data.description };
      }

      // Пробуем отправить тестовое сообщение
      await this.sendMessage('🔔 GitLab Notifier подключен успешно!');

      return { success: true, bot: data.result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Получение информации о чате
  async getChatInfo() {
    try {
      const response = await fetch(`${this.apiUrl}/getChat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: this.chatId
        })
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(`Telegram API Error: ${data.description}`);
      }

      return data.result;
    } catch (error) {
      console.error('Ошибка получения информации о чате:', error);
      throw error;
    }
  }
}

