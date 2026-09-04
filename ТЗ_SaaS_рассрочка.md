# Техническое задание: SaaS-платформа учёта клиентов и рассрочки

**Актуализация:** 24.07.2026 — по текущему коду `backend` + `frontend` (ветка `main`, prod Timeweb App Platform).

## Контекст проекта

Внутренняя система для юридической компании «Решение» (банкротство физлиц, Грозный), заменяющая учёт в Excel. Архитектура с первого дня поддерживает **несколько организаций** (`organization_id` во всех бизнес-таблицах).

Дополнительно реализован **отдельный модуль «Товарная рассрочка»** (`organization_type = retail`) для инвесторов и розничных договоров.

**Prod:** Timeweb App Platform + Managed PostgreSQL.  
**Repo:** `Tips95/fin_reshenie`.

---

## Стек (фактический)

| Слой | Технологии |
|------|------------|
| Backend | FastAPI, Python 3.11+, SQLAlchemy 2.0, Alembic, Pydantic v2 |
| БД | PostgreSQL (Timeweb Managed), SSL |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Auth | JWT (access + refresh), bcrypt |
| Экспорт | openpyxl → `.xlsx` |
| Деплой | Docker, docker-compose (local), Timeweb App Platform (prod) |
| API prefix | `/api` |

---

## 1. Архитектура данных

### 1.1. Базовые сущности (банкротство)

**organizations** — id, name, `organization_type` (`bankruptcy` \| `retail`), created_at

**users** — id, organization_id, full_name, email, password_hash, role (`owner`, `manager`, `call_center`, `investor`), is_active, `investment_amount` (для investor), created_at

**clients** — id, organization_id, assigned_manager_id, full_name, phone, contract_date, debt_amount, status (`active`, `completed`, `defaulted`, `cancelled`), **`engagement_stage`** (`document_collection` \| `bankruptcy`), **`procedure_stage`** (воронка: договор → депозит → ФУ → суд → завершение), is_deleted, created_at, updated_at

**pricing_tiers** — тарифная сетка по диапазонам долга (min/max, total_cost, first/second month, remaining_months, effective_from, is_active)

**installment_plans** — client_id, pricing_tier_id, total_amount, start_date, total_months

**payment_schedule** — installment_plan_id, month_number, due_date, planned_amount, paid_amount, paid_date, status, **deferred_until**, **deferral_comment**, **overdue_waived**

**payments** — client_id, payment_schedule_id, amount, payment_date, comment, created_by, **is_refund**, is_deleted

**client_mandatory_payments** — депозит (25 000 ₽), фин. управление, судебная пошлина; planned/paid amounts, is_applicable, status

**client_mandatory_payment_records** — журнал внесений по обязательным платежам

**document_collections** — предуслуга «Сбор документов»: total_amount, **collection_fee** (касса 10k), **notary_fee** (2k), **manager_commission** (1k), status, paid_date

**operating_expenses** — ежемесячные расходы организации (зарплаты, аренда, ЖКХ и т.д.)

**expense_payments** — факт оплаты расходов по месяцам

**manager_tasks** — задачи менеджерам (авто по просрочке, ручные)

**audit_logs** — журнал изменений (entity, field, old/new, user, timestamp)

**court_deposit_tracking** — legacy-таблица из начальной схемы; в UI не используется, записи не создаются

### 1.2. Модуль «Товарная рассрочка» (retail)

**retail_clients**, **retail_contracts**, **retail_payments**, **retail_term_rates**, **retail_overdue_logs** — отдельный контур для owner/investor.

### 1.3. Миграции Alembic (11 версий)

От `initial_schema` до: deferral, operating_expenses, mandatory_payments, procedure_stage/tasks, document_collection, retail, investor amounts, overdue_waived, mandatory_payment_records.

---

## 2. Роли и права доступа (реализовано)

| Роль | Доступ |
|------|--------|
| **owner** | Полный доступ: финансы, аналитика, расходы, команда, тарифы, журнал, удаление клиентов/платежей, обязательные платежи, снятие просрочки, внесение платежей по рассрочке |
| **manager** | Свои клиенты + незакреплённые на этапе «Сбор документов»; редактирование графика; сбор документов; **без** внесения платежей по рассрочке, **без** обязательных платежей (депозит/ФУ/пошлина) |
| **call_center** | Краткая карточка клиента, без финансов и дашборда |
| **investor** | Только модуль `/retail` (свои договоры и капитал) |

Права проверяются в FastAPI (`deps.py`, `access.py`), не только на фронте.

---

## 3. Ключевая бизнес-логика

### 3.1. График рассрочки (банкротство)

1. Подбор `pricing_tier` по `debt_amount` и `contract_date` (диапазоны **включительные**).
2. Генерация `payment_schedule` по тарифу (1-й, 2-й месяц + remaining).
3. Старые графики **не пересчитываются** при смене прайса (`effective_from`).
4. Owner может **вручную** задать сумму договора и редактировать график (суммы, даты, добавление/удаление месяцев).
5. Окно оплаты: с **25-го** по конец месяца; просрочка — после grace period (`schedule_dates.py`).

### 3.2. Сбор документов (до банкротства)

- Стандарт: **13 000 ₽** = 10 000 (касса) + 2 000 (нотариус) + 1 000 (менеджер).
- Legacy-клиенты: часто **10 000 ₽** целиком в кассу.
- Суммы можно менять **до оплаты** (owner/manager).
- После оплаты — перевод на банкротство с указанием долга и созданием графика.

### 3.3. Прибыль компании

```
Прибыль = платежи по рассрочке + collection_fee (касса сбора) − обязательные платежи
Чистая прибыль (месяц) = поступления месяца + касса сбора месяца − обязательные месяца − operating_expenses
```

**Не входят в прибыль:** нотариус, комиссия менеджера по сбору, обязательные платежи клиента (депозит/ФУ/пошлина) — транзит.

**«Сумма активных договоров»** на дашборде = сумма `planned_amount` по графикам активных клиентов на банкротстве (не `debt_amount`).

### 3.4. Legacy-импорт

Скрипт `backend/scripts/import_legacy_excel.py` — перенос из Excel «Новый УЧЕТ.xlsm» (dry-run / `--execute`).

---

## 4. Реализованный функционал

### 4.1. Ядро — ✅

- [x] Авторизация JWT (login, refresh, `/auth/me`)
- [x] CRUD клиентов, soft delete, назначение менеджера
- [x] Админка тарифной сетки (`/pricing`)
- [x] Автогенерация графика + ручное редактирование графика
- [x] Фиксация платежей по рассрочке (**только owner**)
- [x] Возвраты (`is_refund`), удаление платежей (owner)
- [x] Список клиентов: фильтры (статус, менеджер, просрочка, этап, сбор), сортировка, поиск
- [x] Два списка: «Сбор документов» и «Договоры» (банкротство)

### 4.2. Сбор документов — ✅

- [x] Этап `document_collection` до банкротства
- [x] Разбивка 10+2+1, ручная правка сумм
- [x] Фиксация оплаты, перевод на банкротство
- [x] «Принять в работу» — закрепление незакреплённого клиента (manager)
- [x] Учёт в дашборде/аналитике (касса / нотариус / менеджерам отдельно)

### 4.3. Обязательные платежи — ✅

- [x] Депозит 25k, финуправление, госпошлина (вкл/выкл)
- [x] Внесение и редактирование — **только owner**

### 4.4. Дашборд и аналитика — ✅

- [x] Дашборд owner: рассрочка, сбор, обязательные, расходы, прибыль
- [x] Касса («кубышка»): ручной остаток на начало месяца + перенос на следующий
- [x] Оптимизация: **один запрос** `/dashboard/summary` (просрочка batch + preview + счётчик задач)
- [x] Аналитика owner: прибыль по клиентам, тренды, комиссии менеджеров за сбор
- [x] Экспорт Excel: список клиентов, карточка, просрочки

### 4.5. Операционка — ✅

- [x] Ежемесячные расходы организации (`/expenses`)
- [x] Журнал аудита (`/audit`) + блок на карточке клиента
- [x] Воронка процедуры (`procedure_stage`) + задачи по просрочкам (`/tasks`, `/funnel`)
- [x] Отсрочка платежа, снятие просрочки (owner)
- [x] Перестройка дат платежей от даты договора (legacy, owner)
- [x] Управление пользователями (`/users`)

### 4.6. Товарная рассрочка — ✅

- [x] Отдельный UI (`/retail/*`): дашборд, клиенты, договоры, инвесторы, капитал
- [x] Роли owner + investor

### 4.7. Не реализовано (бэклог)

- [ ] Автонапоминания WhatsApp / Green API
- [ ] Push-уведомления менеджерам
- [ ] Интеграция amoCRM
- [ ] Онбординг новых организаций (self-service)
- [ ] Биллинг SaaS / white-label
- [ ] PDF-экспорт
- [ ] UI для `organizations/current` (API есть)

---

## 5. API — эндпоинты (префикс `/api`)

### Auth
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/login` | Вход |
| POST | `/auth/refresh` | Обновление токена |
| GET | `/auth/me` | Текущий пользователь |

### Dashboard
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/dashboard/summary` | Сводка (+ `open_tasks_count`, `overdue_clients_preview`) |
| PUT | `/dashboard/cash-balance` | Остаток кассы на начало месяца (owner) |
| POST | `/dashboard/cash-balance/carry-forward` | Перенести остаток в следующий месяц (owner) |

### Clients
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/clients` | Список (фильтры, sort_by, overdue, collection_view) |
| POST | `/clients` | Создание |
| GET | `/clients/{id}` | Карточка (краткая для call_center) |
| GET | `/clients/{id}/detail` | Полная карточка |
| PATCH | `/clients/{id}` | Обновление |
| DELETE | `/clients/{id}` | Soft delete (owner) |
| POST | `/clients/{id}/payments/align-schedule-dates` | Legacy: выровнять даты (owner) |

### Document collection
| Метод | Путь | Описание |
|-------|------|----------|
| PATCH | `/clients/{id}/document-collection` | Суммы сбора (до оплаты) |
| POST | `/clients/{id}/document-collection/record` | Зафиксировать оплату |
| POST | `/clients/{id}/convert-to-bankruptcy` | Перевод на банкротство |

### Mandatory payments
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/clients/{id}/mandatory-payments` | Список |
| PATCH | `/clients/{id}/mandatory-payments/{pid}` | План/применимость (owner) |
| POST | `/clients/{id}/mandatory-payments/{pid}/record` | Внесение (owner) |

### Installment plans
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/clients/{id}/installment-plans` | Список планов |
| POST | `/clients/{id}/installment-plans` | Создание |
| GET | `/clients/{id}/installment-plans/{plan_id}` | План |
| PATCH | `/clients/{id}/installment-plans/{plan_id}` | Сумма договора (owner) |

### Payment schedule
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/payment-schedule/{client_id}/installment-plans/{plan_id}/payment-schedule` | График |
| POST | `/payment-schedule/{client_id}/installment-plans/{plan_id}/payment-schedule` | Добавить месяц |
| GET | `/payment-schedule/{schedule_id}` | Строка графика |
| PATCH | `/payment-schedule/{schedule_id}` | Сумма/дата |
| DELETE | `/payment-schedule/{schedule_id}` | Удалить месяц |
| POST | `/payment-schedule/{schedule_id}/defer` | Отсрочка |
| POST | `/payment-schedule/{schedule_id}/waive-overdue` | Снять просрочку (owner) |

### Payments
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/payments` | Список (client_id) |
| POST | `/payments` | Создать (**owner**) |
| GET | `/payments/{id}` | Одна запись |
| PATCH | `/payments/{id}` | Дата (owner) |
| DELETE | `/payments/{id}` | Soft delete (owner) |

### Analytics
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/analytics/overview` | Обзор + тренды (owner) |
| GET | `/analytics/manager-commissions` | Комиссии за сбор (owner) |

### Funnel & Tasks
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/funnel/overview` | Воронка процедуры |
| GET | `/tasks` | Задачи (status=open) |
| POST | `/tasks` | Создать задачу |
| PATCH | `/tasks/{id}` | Обновить статус |
| GET | `/tasks/overview` | Дубликат funnel (legacy API) |

### Operating expenses
| Метод | Путь | Описание |
|-------|------|----------|
| GET/POST | `/operating-expenses` | CRUD расходов |
| PATCH/DELETE | `/operating-expenses/{id}` | |
| GET/POST | `/operating-expenses/payments` | Оплаты расходов |

### Pricing, Users, Organizations
| Метод | Путь | Описание |
|-------|------|----------|
| GET/POST | `/pricing-tiers` | Тарифы |
| GET/PATCH | `/pricing-tiers/{id}` | |
| GET/POST/PATCH/DELETE | `/users`, `/users/{id}` | Команда |
| GET/PATCH | `/organizations/current` | Организация (без UI) |

### Audit & Exports
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/audit-logs` | Журнал (фильтры) |
| GET | `/audit-logs/recent` | Последние события |
| GET | `/exports/clients.xlsx` | Экспорт списка |
| GET | `/exports/clients/{id}.xlsx` | Экспорт карточки |
| GET | `/exports/overdue-clients.xlsx` | Просрочки |

### Retail (`/retail/*`)
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/retail/dashboard/summary` | Дашборд retail |
| GET/POST/DELETE | `/retail/clients`, `/retail/clients/{id}` | Клиенты |
| GET/PATCH | `/retail/clients/{id}` | |
| GET/POST/DELETE | `/retail/contracts`, `/retail/contracts/{id}` | Договоры |
| POST | `/retail/contracts/{id}/payments` | Платёж |
| DELETE | `/retail/payments/{id}` | |
| POST | `/retail/contracts/{id}/overdue-logs` | Лог просрочки |
| GET/POST/PATCH/DELETE | `/retail/investors`, `/retail/investors/me` | Инвесторы |
| GET | `/retail/term-rates` | Ставки |

### Health
| GET | `/health` | Проверка живости |

---

## 6. Frontend — страницы

### Банкротство (AppShell)

| Путь | Страница | Доступ |
|------|----------|--------|
| `/login` | Вход | все |
| `/` | Дашборд | owner (финансы), manager (счётчики) |
| `/clients/collection` | Сбор документов | owner, manager |
| `/clients/contracts` | Договоры (банкротство) | owner, manager |
| `/clients/[id]` | Карточка клиента | owner, manager, call_center (огранич.) |
| `/analytics` | Аналитика | owner |
| `/tasks` | Задачи и воронка | owner, manager |
| `/expenses` | Расходы организации | owner |
| `/audit` | Журнал аудита | owner |
| `/users` | Команда | owner |
| `/pricing` | Тарифная сетка | owner |

`/clients` → редирект на `/clients/contracts`.

### Товарная рассрочка (RetailShell)

| Путь | Страница |
|------|----------|
| `/retail` | Дашборд |
| `/retail/clients` | Клиенты |
| `/retail/contracts` | Договоры |
| `/retail/contracts/[id]` | Карточка договора |
| `/retail/investors` | Инвесторы (owner) |
| `/retail/capital` | Капитал (investor) |

Переход: ссылка «Товарная рассрочка» в сайдбаре банкротства.

---

## 7. Технические требования (соблюдаются)

- Денежные суммы: `numeric(12,2)`, не float
- Soft delete: clients (`is_deleted`), payments (`is_deleted`)
- Audit log на критичные изменения
- Валидация финансовых операций на backend
- Batch-проверка просрочки (`clients_overdue_map`) — без N+1 на дашборде и в фильтрах списка
- CORS, JWT, role-based dependencies

---

## 8. Референс Excel

При проектировании UI ориентир — листы «Банкротство» и «СБОР ДОКУМЕНТОВ» файла «Новый УЧЕТ.xlsm»:

ФИО, телефон, дата договора, сумма договора, помесячные платежи, депозит, финуправление, суд, прибыль, остаток.

В системе: `contract_total` / график вместо «долга кредиторам» на дашборде; обязательные платежи — отдельный блок; сбор документов — отдельная услуга.

---

## 9. История изменений ТЗ

| Дата | Изменения |
|------|-----------|
| Исходная версия | MVP-структура, unchecked этапы |
| 24.07.2026 | Актуализация по prod-коду: сбор документов, обязательные, расходы, аналитика, retail, права менеджеров, оптимизация дашборда, полный каталог API/страниц |
