"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  PhoneInput,
  SectionTitle,
  Select,
  StatCard,
} from "@/components/ui";
import { ApiRequestError, usersApi } from "@/lib/api-client";
import { statusLabel } from "@/lib/format";
import { PHONE_PREFIX } from "@/lib/phone";
import {
  collectErrors,
  filterPersonName,
  hasErrors,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhoneOptional,
} from "@/lib/validation";
import type { User, UserRole } from "@/lib/types";
import { useAuth } from "@/modules/auth/AuthProvider";

const emptyForm = {
  full_name: "",
  email: "",
  phone: "",
  password: "",
  role: "manager" as UserRole,
  is_active: true,
};

type EditForm = {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
  is_active: boolean;
};

function toEditForm(user: User): EditForm {
  return {
    full_name: user.full_name,
    email: user.email ?? "",
    phone: user.phone ?? "",
    password: "",
    role: user.role,
    is_active: user.is_active,
  };
}

function roleTone(role: UserRole): "default" | "success" | "warning" | "danger" {
  if (role === "owner") return "warning";
  if (role === "manager") return "success";
  return "default";
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (currentUser && currentUser.role !== "owner") {
      router.replace("/");
    }
  }, [currentUser, router]);

  async function loadUsers() {
    setLoading(true);
    try {
      setUsers(await usersApi.list());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (currentUser?.role === "owner") {
      void loadUsers();
    }
  }, [currentUser?.role]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const errors = collectErrors({
      full_name: validateFullName(form.full_name),
      email: form.email.trim() ? validateEmail(form.email) : null,
      phone: validatePhoneOptional(form.phone),
      password: validatePassword(form.password),
      login:
        !form.email.trim() && (!form.phone.trim() || form.phone.trim() === PHONE_PREFIX)
          ? "Укажите email или телефон для входа"
          : null,
    });
    if (hasErrors(errors)) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    try {
      await usersApi.create({
        full_name: form.full_name.trim().replace(/\s+/g, " "),
        email: form.email.trim() || null,
        phone: form.phone.trim() && form.phone.trim() !== PHONE_PREFIX ? form.phone.trim() : null,
        password: form.password,
        role: form.role,
        is_active: form.is_active,
      });
      setForm(emptyForm);
      setShowForm(false);
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось создать пользователя");
    }
  }

  function startEdit(user: User) {
    setEditingId(user.id);
    setEditForm(toEditForm(user));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  async function handleSaveEdit(userId: string) {
    if (!editForm) return;
    setSavingId(userId);
    setError(null);
    const errors = collectErrors({
      full_name: validateFullName(editForm.full_name),
      email: editForm.email.trim() ? validateEmail(editForm.email) : null,
      phone: validatePhoneOptional(editForm.phone),
      password: editForm.password.trim() ? validatePassword(editForm.password) : null,
      login:
        !editForm.email.trim() && (!editForm.phone.trim() || editForm.phone.trim() === PHONE_PREFIX)
          ? "Укажите email или телефон для входа"
          : null,
    });
    if (hasErrors(errors)) {
      setEditErrors(errors);
      setSavingId(null);
      return;
    }
    setEditErrors({});
    try {
      const payload: Record<string, unknown> = {
        full_name: editForm.full_name.trim().replace(/\s+/g, " "),
        email: editForm.email.trim() || null,
        phone:
          editForm.phone.trim() && editForm.phone.trim() !== PHONE_PREFIX
            ? editForm.phone.trim()
            : null,
        role: editForm.role,
        is_active: editForm.is_active,
      };
      if (editForm.password.trim()) {
        payload.password = editForm.password;
      }
      await usersApi.update(userId, payload);
      cancelEdit();
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось сохранить изменения");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDeactivate(target: User) {
    if (!window.confirm(`Деактивировать пользователя «${target.full_name}»?`)) return;
    setError(null);
    try {
      await usersApi.deactivate(target.id);
      if (editingId === target.id) cancelEdit();
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось деактивировать пользователя");
    }
  }

  async function handleActivate(userId: string) {
    setSavingId(userId);
    setError(null);
    try {
      await usersApi.update(userId, { is_active: true });
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Не удалось активировать пользователя");
    } finally {
      setSavingId(null);
    }
  }

  if (currentUser?.role !== "owner") {
    return <LoadingState text="Доступ только для руководителя" />;
  }

  const activeCount = users.filter((item) => item.is_active).length;

  return (
    <div className="page-stack">
      <PageHeader
        title="Пользователи"
        subtitle="Команда организации, роли и доступ к системе"
        action={
          <Button onClick={() => setShowForm((value) => !value)}>
            {showForm ? "Скрыть форму" : "Добавить пользователя"}
          </Button>
        }
      />

      <div className="grid gap-2 sm:grid-cols-3">
        <StatCard label="Всего в системе" value={users.length} tone="brand" />
        <StatCard label="Активных" value={activeCount} tone="success" />
        <StatCard label="Деактивированных" value={users.length - activeCount} />
      </div>

      {error && (
        <p className="alert-danger">
          {error}
        </p>
      )}

      {showForm && (
        <Card variant="accent">
          <SectionTitle
            title="Новый пользователь"
            description="Для входа используется email или телефон и пароль"
          />
          <form onSubmit={handleCreate} className="grid gap-2 md:grid-cols-2">
            <FormField label="ФИО" error={formErrors.full_name}>
              <Input
                placeholder="Иванов Иван"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: filterPersonName(e.target.value) })}
                required
              />
            </FormField>
            <FormField label="Email" error={formErrors.email || formErrors.login}>
              <Input
                placeholder="user@example.com"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </FormField>
            <FormField label="Телефон" error={formErrors.phone}>
              <PhoneInput
                allowEmpty
                value={form.phone}
                onValueChange={(phone) => setForm({ ...form, phone })}
              />
            </FormField>
            <FormField label="Пароль" error={formErrors.password}>
              <Input
                placeholder="Мин. 6 символов"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={6}
              />
            </FormField>
            <Select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              <option value="manager">Менеджер</option>
              <option value="call_center">Колл-центр</option>
              <option value="owner">Руководитель</option>
            </Select>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Активен сразу после создания
            </label>
            <Button type="submit" className="md:col-span-2">
              Создать пользователя
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <SectionTitle title="Список пользователей" />
        {loading ? (
          <LoadingState text="Загрузка пользователей..." />
        ) : users.length === 0 ? (
          <EmptyState
            action={
              <Button type="button" onClick={() => setShowForm(true)}>
                Добавить пользователя
              </Button>
            }
          >
            Пользователи не найдены
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Email</th>
                  <th>Телефон</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => {
                  const isSelf = item.id === currentUser?.id;
                  const isEditing = editingId === item.id;

                  if (isEditing && editForm) {
                    return (
                      <tr key={item.id} className="is-editing">
                        <td colSpan={6}>
                          <div className="grid gap-2 py-2 md:grid-cols-2 xl:grid-cols-3">
                            <FormField label="ФИО" error={editErrors.full_name}>
                              <Input
                                value={editForm.full_name}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, full_name: filterPersonName(e.target.value) })
                                }
                              />
                            </FormField>
                            <FormField label="Email" error={editErrors.email || editErrors.login}>
                              <Input
                                type="email"
                                value={editForm.email}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, email: e.target.value })
                                }
                              />
                            </FormField>
                            <FormField label="Телефон" error={editErrors.phone}>
                              <PhoneInput
                                allowEmpty
                                value={editForm.phone || ""}
                                onValueChange={(phone) =>
                                  setEditForm({ ...editForm, phone })
                                }
                              />
                            </FormField>
                            <FormField label="Новый пароль" error={editErrors.password}>
                              <Input
                                type="password"
                                placeholder="Оставьте пустым, если не меняете"
                                value={editForm.password}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, password: e.target.value })
                                }
                                minLength={6}
                              />
                            </FormField>
                            <FormField label="Роль">
                              <Select
                                value={editForm.role}
                                disabled={isSelf}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    role: e.target.value as UserRole,
                                  })
                                }
                              >
                                <option value="manager">Менеджер</option>
                                <option value="call_center">Колл-центр</option>
                                <option value="owner">Руководитель</option>
                              </Select>
                            </FormField>
                            <FormField label="Статус">
                              <Select
                                value={editForm.is_active ? "active" : "inactive"}
                                disabled={isSelf}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    is_active: e.target.value === "active",
                                  })
                                }
                              >
                                <option value="active">Активен</option>
                                <option value="inactive">Деактивирован</option>
                              </Select>
                            </FormField>
                            <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
                              <Button
                                onClick={() => handleSaveEdit(item.id)}
                                disabled={savingId === item.id}
                              >
                                {savingId === item.id ? "Сохранение..." : "Сохранить"}
                              </Button>
                              <Button variant="secondary" onClick={cancelEdit}>
                                Отмена
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={item.id} className={!item.is_active ? "opacity-70" : undefined}>
                      <td data-label="ФИО" className="font-semibold text-foreground">
                        {item.full_name}
                        {isSelf && (
                          <span className="ml-2 text-xs font-normal text-muted">(вы)</span>
                        )}
                      </td>
                      <td data-label="Email" className="text-muted">{item.email || "—"}</td>
                      <td data-label="Телефон" className="text-muted">{item.phone || "—"}</td>
                      <td data-label="Роль">
                        <Badge tone={roleTone(item.role)}>{statusLabel(item.role)}</Badge>
                      </td>
                      <td data-label="Статус">
                        <Badge tone={item.is_active ? "success" : "default"}>
                          {item.is_active ? "Активен" : "Деактивирован"}
                        </Badge>
                      </td>
                      <td data-label="Действия">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button variant="secondary" onClick={() => startEdit(item)}>
                            Изменить
                          </Button>
                          {!isSelf && item.is_active && (
                            <Button variant="danger" onClick={() => handleDeactivate(item)}>
                              Деактивировать
                            </Button>
                          )}
                          {!isSelf && !item.is_active && (
                            <Button
                              variant="secondary"
                              disabled={savingId === item.id}
                              onClick={() => handleActivate(item.id)}
                            >
                              {savingId === item.id ? "..." : "Активировать"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
