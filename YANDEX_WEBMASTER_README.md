# Яндекс Вебмастер Интеграция

## Настройка

### 1. Создание приложения в Яндекс.OAuth

1. Перейдите на [oauth.yandex.ru](https://oauth.yandex.ru/)
2. Нажмите "Создать приложение"
3. Заполните информацию:
   - **Название**: Hotel Analytics Webmaster
   - **Описание**: Интеграция для проверки индексации страниц
   - **Платформы**: Веб-сервисы
   - **Redirect URI**: `http://localhost:3000/api/webmaster/oauth/callback` (для разработки)
4. В разделе "Доступы" выберите:
   - Яндекс.Вебмастер (webmaster:read)
5. Сохраните приложение

### 2. Настройка переменных окружения

Создайте файл `.env.local` в корне проекта и добавьте переменные:

```env
# === Yandex OAuth Configuration ===
YANDEX_CLIENT_ID=ваш_client_id_из_приложения
YANDEX_CLIENT_SECRET=ваш_client_secret_из_приложения
YANDEX_REDIRECT_URI=http://localhost:3000/api/webmaster/oauth/callback

# === NextAuth Configuration ===
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-secret-key-here
```

**Важно:** Используйте `.env.local`, а не `.env` для локальной разработки в Next.js.

### 3. Добавление сайта в Яндекс.Вебмастер

1. Перейдите в [Яндекс.Вебмастер](https://webmaster.yandex.ru/)
2. Добавьте ваш сайт (например, `https://gdeotel.ru/`)
3. Подтвердите права на сайт одним из доступных способов

## Использование

1. Перейдите на страницу `/webmaster`
2. Нажмите "Авторизоваться в Яндекс"
3. Предоставьте необходимые разрешения
4. После авторизации вы сможете просматривать:
   - Список проиндексированных страниц
   - Статистику индексации
   - Статус индексации отдельных URL

## API Endpoints

### GET /api/webmaster/oauth?action=auth_url
Возвращает URL для авторизации в Яндекс.OAuth

### POST /api/webmaster/oauth
Обменивает authorization code на access token

### GET /api/webmaster/oauth?action=status
Проверяет статус авторизации пользователя

### GET /api/webmaster/indexing?site=URL&limit=N
Возвращает список проиндексированных страниц для указанного сайта

## Компоненты

### IndexingChecker
Основной компонент для отображения данных индексации:
- Показывает статистику индексации
- Отображает список URL
- Управляет авторизацией

## Что было реализовано

### ✅ Готовые компоненты
- **OAuth авторизация** через Яндекс
- **Хранение токенов** в памяти (демо) / готово для БД
- **Реальные API вызовы** к Яндекс Вебмастер
- **Обработка ошибок** и статусов
- **UI компоненты** для отображения данных

## Отладка

### Проверка переменных окружения

Если получаете ошибку "Отсутствует обязательный параметр 'client_id'", проверьте:

1. **Файл `.env.local` существует** в корне проекта
2. **Переменные правильно названы:**
   ```env
   YANDEX_CLIENT_ID=ваш_client_id
   YANDEX_CLIENT_SECRET=ваш_client_secret
   YANDEX_REDIRECT_URI=http://localhost:3000/api/webmaster/oauth/callback
   ```
3. **Перезагрузите сервер разработки** после изменения `.env.local`

### Логи отладки

При авторизации в консоли сервера будут отображаться:
- `YANDEX_CLIENT_ID: SET/NOT SET`
- `YANDEX_CLIENT_SECRET: SET/NOT SET`
- Статус обмена кода на токен

### Тестирование

1. Перейдите на `/webmaster`
2. Нажмите "Авторизоваться в Яндекс"
3. Проверьте консоль браузера и сервера на ошибки

### 🔧 Для продакшена добавить
1. **База данных** для токенов вместо Map
2. **Refresh токены** для автоматического обновления
3. **Rate limiting** для API вызовов
4. **Кэширование** результатов
5. **Логирование** запросов

### 📊 API Endpoints
- `GET /api/webmaster/oauth?action=auth_url` - URL авторизации
- `POST /api/webmaster/oauth` - обмен кода на токен
- `GET /api/webmaster/oauth?action=status` - проверка авторизации
- `GET /api/webmaster/indexing?site=URL&limit=N` - данные индексации

## Полезные ссылки

- [Документация Яндекс.Вебмастер API](https://yandex.ru/dev/webmaster/doc/)
- [Яндекс.OAuth](https://yandex.ru/dev/oauth/)
- [Яндекс.Вебмастер](https://webmaster.yandex.ru/)