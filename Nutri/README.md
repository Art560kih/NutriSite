# Nutri

Сайт для учёта питания. ASP.NET Core отдаёт существующий HTML, CSS и JavaScript из `wwwroot`, а контроллеры обслуживают запросы к `/api` с того же адреса.

## Установка Docker

### Windows 10/11

1. Откройте PowerShell от имени администратора и выполните `wsl --install`. Если WSL уже установлен, выполните `wsl --update`. Перезагрузите компьютер, если Windows попросит. Для WSL 2 нужна включённая аппаратная виртуализация.
2. Скачайте и установите Docker Desktop для Windows с официальной страницы. В установщике выберите WSL 2, если он предлагает выбрать способ запуска. Запустите Docker Desktop через меню «Пуск» и дождитесь запуска Docker Engine. [Docker Desktop для Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
3. Откройте обычный PowerShell и выполните команды проверки ниже.

### macOS

1. Откройте меню Apple → «Об этом Mac». Скачайте Docker Desktop для **Apple silicon** или **Intel** в зависимости от процессора. [Docker Desktop для macOS](https://docs.docker.com/desktop/setup/install/mac-install/)
2. Откройте скачанный DMG и перетащите Docker в «Программы». Запустите Docker Desktop и дождитесь запуска Docker Engine. Откройте Терминал для проверки.

### Linux

Установите Docker Engine и плагин Compose v2 из официального репозитория для своего дистрибутива. На Ubuntu добавьте официальный репозиторий и установите пакеты командами ниже. [Docker Engine для Ubuntu](https://docs.docker.com/engine/install/ubuntu/) · [Другие дистрибутивы](https://docs.docker.com/engine/install/)

```bash
sudo apt update
sudo apt install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Если Docker Engine установлен с доступом через root и команды выдают ошибку доступа к сокету, запускайте команды Docker с `sudo`.

### Проверка установки

```bash
docker info
docker compose version
```

Первая команда проверяет связь с Docker Engine, вторая показывает версию Compose. Для сборки из исходников нужен интернет, чтобы Docker скачал базовые образы и пакеты NuGet.

## Запуск сайта в Docker

1. Полностью распакуйте ZIP. Откройте терминал в папке `Nutri`, где лежит `compose.yaml`. В Windows можно открыть эту папку в Проводнике, набрать `powershell` в адресной строке и нажать Enter.
2. Выполните:

   ```bash
   docker compose up --build -d
   ```

3. Откройте **http://localhost:5180**. Зарегистрируйтесь и войдите. ASP.NET Core обслуживает фронтенд и API в одном контейнере, а SQLite создаёт базу при первом запуске.

Проверить статус и посмотреть логи:

```bash
docker compose ps
docker compose logs -f nutri
```

Остановить и удалить контейнер:

```bash
docker compose down
```

База и ключи сессий сохраняются в именованном томе Docker `nutri-data`. После `docker compose down` та же команда запуска поднимет сайт с прежними данными. Команда `docker compose down -v` удалит и том, поэтому используйте её только для полного сброса данных.

Если порт 5180 занят, создайте файл `.env` рядом с `compose.yaml`, запишите строку `NUTRI_PORT=5181` и повторите запуск. Тогда адрес будет **http://localhost:5181**. Приложение опубликовано на локальном интерфейсе компьютера.

## Запуск без Docker

Установите **.NET 10 SDK**. В каталоге проекта выполните:

```bash
dotnet run --urls http://localhost:5180
```

Откройте **http://localhost:5180**, зарегистрируйтесь и войдите. При первом запуске EF Core создаст `App_Data/nutri.db` и загрузит 18 продуктов из исходного каталога. Аккаунты старой версии из localStorage потребуют повторной регистрации.

При запуске через Docker файл базы и ключи лежат в томе `nutri-data`, внутри контейнера по пути `/var/lib/nutri`.

База SQLite хранит пользователей, цели, настройки, продукты и записи рациона. Каталог общий, а собственные продукты и рацион доступны только владельцу. При запуске без Docker ключи cookie-сессий находятся в `App_Data/keys`. Чтобы изменить расположение данных, задайте переменную окружения `Nutri__DataPath`.

## Контроллеры

| Метод и путь | Действие |
| --- | --- |
| `POST /api/account/register` | Регистрация |
| `POST /api/account/login` | Вход и установка cookie-сессии |
| `POST /api/account/logout` | Выход |
| `GET /api/account` | Текущий профиль |
| `PUT /api/account` | Изменение профиля. Для смены email требуется текущий пароль |
| `PUT /api/account/preferences` | Сохранение настроек уведомлений |
| `GET /api/products` | Общий каталог и собственные продукты |
| `POST /api/products` | Добавление собственного продукта |
| `POST /api/meals` | Добавление порции 100 г по ID продукта |
| `GET /api/diary?timeZone=Europe/Moscow` | Рацион за сегодня, итоги и статистика за последние 7 календарных дней |
| `PUT /api/goal` | Расчёт и сохранение суточной цели |

День определяется по часовому поясу браузера. Калькулятор использует формулу Миффлина — Сан Жеора, коэффициент активности и поправку ±15% для снижения или набора веса. Доли энергии для белков, жиров и углеводов составляют 25%, 30% и 45% соответственно. Настройки уведомлений сохраняются в базе. Отправка писем и напоминаний не подключена.
