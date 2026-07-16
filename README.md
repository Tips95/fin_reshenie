# Rassrochka SaaS

Монорепозиторий платформы учёта клиентов и рассрочки для юридических компаний.

## Структура

```
/backend   — FastAPI (Python), API и бизнес-логика
/frontend  — Next.js 14 (App Router), веб-интерфейс
```

## Локальный запуск (без Docker)

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt

# Миграции (нужен запущенный PostgreSQL)
alembic upgrade head

uvicorn app.main:app --reload --port 8000
```

Проверка: http://localhost:8000/api/health

### Тестовый пользователь (после миграций)

```bash
python -m app.services.seed
# admin@reshenie.local / admin123
```

### Auth API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/login` | Логин (email или телефон + пароль) → access + refresh JWT |
| POST | `/api/auth/refresh` | Обновление пары токенов по refresh JWT |
| GET | `/api/auth/me` | Текущий пользователь (Bearer access token) |

Проверка ролей в эндпоинтах — через dependency `require_roles(...)` (owner / manager / call_center).

### CRUD API (шаг 5)

| Ресурс | Путь | Права |
|--------|------|-------|
| Организация | `GET/PATCH /api/organizations/current` | все / owner |
| Пользователи | `GET/POST/PATCH/DELETE /api/users` | owner |
| Тарифы | `GET/POST/PATCH /api/pricing-tiers` | owner |
| Клиенты | `GET/POST/PATCH/DELETE /api/clients` | owner, manager; call_center — ограниченный просмотр |
| Графики | `GET/POST /api/clients/{id}/installment-plans` | owner, manager |
| План платежей | `GET /api/clients/{id}/installment-plans/{plan_id}/payment-schedule` | owner, manager |
| Платежи | `GET/POST/DELETE /api/payments` | owner, manager |

При создании клиента автоматически генерируется график рассрочки по тарифной сетке.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Приложение: http://localhost:3000

Локально API проксируется через Next.js rewrite (`/api` → `http://localhost:8000/api`).

| Путь | Описание |
|------|----------|
| `/login` | Вход |
| `/` | Дашборд |
| `/clients` | Список клиентов |
| `/clients/[id]` | Карточка клиента |
| `/pricing` | Тарифы (owner) |

## Запуск через Docker

Требуется [Docker Desktop](https://www.docker.com/products/docker-desktop/) (или Docker Engine + Compose).

### Локально (с PostgreSQL в контейнере)

```bash
# из корня репозитория
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
```

Миграции и seed выполняются автоматически при старте backend.

| Сервис   | Адрес |
|----------|-------|
| Приложение (nginx) | http://localhost |
| API health | http://localhost/api/health |
| API docs | http://localhost/api/docs |

### Timeweb Cloud (App Platform)

В корне лежит `docker-compose.yml` для [App Platform Docker Compose](https://timeweb.cloud/docs/apps/deploying-with-docker-compose):

- **nginx** — первый сервис (на него вешается домен), порт `9000`
- **PostgreSQL** — Managed DB в Timeweb (не в compose, т.к. volumes запрещены)
- миграции и seed — при старте backend

Остановка локального стека:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

С удалением данных PostgreSQL:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down -v
```

### Сервисы в docker-compose

- **postgres** — только в `docker-compose.local.yml` (PostgreSQL 16)
- **backend** — FastAPI (uvicorn :8000)
- **frontend** — Next.js standalone (:3000)
- **nginx** — reverse proxy: `/` → frontend, `/api/` → backend

## Документация

Техническое задание: [ТЗ_SaaS_рассрочка.md](./ТЗ_SaaS_рассрочка.md)
