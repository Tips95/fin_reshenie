"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Badge,
  Button,
  Card,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  SectionTitle,
  Select,
} from "@/components/ui";
import { ApiRequestError, usersApi } from "@/lib/api-client";
import { statusLabel } from "@/lib/format";
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
    if (!form.email.trim() && !form.phone.trim()) {
      setError("Укажите email или телефон для входа");
      return;
    }
    try {
      await usersApi.create({
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
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
    if (!editForm.email.trim() && !editForm.phone.trim()) {
      setError("Укажите email или телефон для входа");
      setSavingId(null);
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
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
    <div className="space-y-4">
      <PageHeader
        title="Пользователи"
        subtitle="Команда организации, роли и доступ к системе"
        action={
          <Button onClick={() => setShowForm((value) => !value)}>
            {showForm ? "Скрыть форму" : "Добавить пользователя"}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Всего в системе</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{users.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Активных</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{activeCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Деактивированных</p>
          <p className="mt-1 text-2xl font-bold text-slate-700">{users.length - activeCount}</p>
        </Card>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {showForm && (
        <Card variant="accent">
          <SectionTitle
            title="Новый пользователь"
            description="Для входа используется email или телефон и пароль"
          />
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
            <Input
              placeholder="ФИО"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />
            <Input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="Телефон"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              placeholder="Пароль (мин. 6 символов)"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
            />
            <Select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              <option value="manager">Менеджер</option>
              <option value="call_center">Колл-центр</option>
              <option value="owner">Руководитель</option>
            </Select>
            <label className="flex items-center gap-2 text-sm text-slate-700">
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
          <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Пользователи не найдены
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
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
                          <div className="grid gap-4 py-2 md:grid-cols-2 xl:grid-cols-3">
                            <FormField label="ФИО">
                              <Input
                                value={editForm.full_name}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, full_name: e.target.value })
                                }
                              />
                            </FormField>
                            <FormField label="Email">
                              <Input
                                type="email"
                                value={editForm.email}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, email: e.target.value })
                                }
                              />
                            </FormField>
                            <FormField label="Телефон">
                              <Input
                                value={editForm.phone}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, phone: e.target.value })
                                }
                              />
                            </FormField>
                            <FormField label="Новый пароль">
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
                      <td className="font-semibold text-slate-800">
                        {item.full_name}
                        {isSelf && (
                          <span className="ml-2 text-xs font-normal text-slate-500">(вы)</span>
                        )}
                      </td>
                      <td className="text-slate-600">{item.email || "—"}</td>
                      <td className="text-slate-600">{item.phone || "—"}</td>
                      <td>
                        <Badge tone={roleTone(item.role)}>{statusLabel(item.role)}</Badge>
                      </td>
                      <td>
                        <Badge tone={item.is_active ? "success" : "default"}>
                          {item.is_active ? "Активен" : "Деактивирован"}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
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
