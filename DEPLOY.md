# AlmazStat: deployment на Ubuntu/Debian VPS

## 1. Подготовка сервера

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

Проверьте установленные версии:

```bash
node --version
npm --version
pm2 --version
```

## 2. Клонирование проекта

Замените URL на адрес репозитория AlmazStat:

```bash
git clone https://github.com/OWNER/REPOSITORY.git almazstat
cd almazstat
```

## 3. Установка зависимостей

```bash
npm install --omit=dev
```

## 4. Настройка переменных окружения

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Заполните `.env` на сервере:

```dotenv
API_FOOTBALL_KEY=YOUR_REAL_API_FOOTBALL_KEY
PORT=5000
```

Файл `.env` исключён из Git. Не добавляйте его в репозиторий.

## 5. Запуск через PM2

Загрузите переменные из `.env` в текущую shell-сессию и запустите существующий `server.js`:

```bash
set -a
. ./.env
set +a
pm2 start server.js --name almazstat
```

Проверьте процесс и health endpoint:

```bash
pm2 status
curl http://127.0.0.1:5000/health
```

Ожидаемый ответ:

```json
{"status":"ok","service":"almazstat"}
```

## 6. Сохранение процесса и автозапуск

```bash
pm2 save
pm2 startup
```

Команда `pm2 startup` выведет дополнительную команду с `sudo`. Выполните её без изменений, затем ещё раз сохраните список процессов:

```bash
pm2 save
```

## Обновление приложения

```bash
cd almazstat
git pull
npm install --omit=dev
set -a
. ./.env
set +a
pm2 restart almazstat --update-env
```

Проверка после обновления:

```bash
curl http://127.0.0.1:5000/health
pm2 logs almazstat --lines 50
```