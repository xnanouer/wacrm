'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, Plus, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/hooks/use-auth';
import type {
  AccountMember,
  Department,
  DepartmentMember,
  QuickReply,
} from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SettingsPanelHead } from './settings-panel-head';

export function TicketingSettings() {
  const { canEditSettings, accountRole, user } = useAuth();
  const canManageReplies = canEditSettings || accountRole === 'supervisor';
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [memberships, setMemberships] = useState<
    Record<string, DepartmentMember[]>
  >({});
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newDepartmentColor, setNewDepartmentColor] = useState('#10b981');
  const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>(
    {}
  );
  const [selectedMembershipRoles, setSelectedMembershipRoles] = useState<
    Record<string, 'member' | 'supervisor'>
  >({});
  const [replyTitle, setReplyTitle] = useState('');
  const [replyShortcut, setReplyShortcut] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [replyDepartmentId, setReplyDepartmentId] = useState('');
  const [saving, setSaving] = useState(false);
  const manageableReplyDepartments = departments.filter(
    (department) =>
      canEditSettings ||
      (memberships[department.id] ?? []).some(
        (membership) =>
          membership.user_id === user?.id &&
          membership.member_role === 'supervisor'
      )
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [departmentsResponse, membersResponse, repliesResponse] =
        await Promise.all([
          fetch('/api/departments', { cache: 'no-store' }),
          fetch('/api/account/members', { cache: 'no-store' }),
          fetch('/api/quick-replies', { cache: 'no-store' }),
        ]);
      if (!departmentsResponse.ok)
        throw new Error('No se pudieron cargar los departamentos');
      const departmentPayload = (await departmentsResponse.json()) as {
        departments: Department[];
      };
      const nextDepartments = departmentPayload.departments ?? [];
      setDepartments(nextDepartments);

      if (membersResponse.ok) {
        const memberPayload = (await membersResponse.json()) as {
          members: AccountMember[];
        };
        setMembers(memberPayload.members ?? []);
      }
      if (repliesResponse.ok) {
        const replyPayload = (await repliesResponse.json()) as {
          quickReplies: QuickReply[];
        };
        setQuickReplies(replyPayload.quickReplies ?? []);
      }

      const membershipEntries = await Promise.all(
        nextDepartments.map(async (department) => {
          const response = await fetch(
            `/api/departments/${department.id}/members`,
            { cache: 'no-store' }
          );
          const payload = response.ok
            ? ((await response.json()) as { members: DepartmentMember[] })
            : { members: [] };
          return [department.id, payload.members] as const;
        })
      );
      setMemberships(Object.fromEntries(membershipEntries));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Error de configuración'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDepartment() {
    if (!newDepartmentName.trim()) return;
    setSaving(true);
    const response = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newDepartmentName.trim(),
        color: newDepartmentColor,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.error(payload.error || 'No se pudo crear');
    setNewDepartmentName('');
    toast.success('Departamento creado');
    await load();
  }

  async function toggleDepartment(department: Department) {
    const response = await fetch(`/api/departments/${department.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !department.is_active }),
    });
    if (!response.ok)
      return toast.error('No se pudo actualizar el departamento');
    await load();
  }

  async function addMember(departmentId: string) {
    const userId = selectedUsers[departmentId];
    if (!userId) return;
    const response = await fetch(`/api/departments/${departmentId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        memberRole: selectedMembershipRoles[departmentId] ?? 'member',
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(payload.error || 'No se pudo agregar');
    toast.success('Miembro agregado al departamento');
    await load();
  }

  async function removeMember(departmentId: string, userId: string) {
    const response = await fetch(
      `/api/departments/${departmentId}/members?userId=${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
    if (!response.ok) return toast.error('No se pudo quitar el miembro');
    await load();
  }

  async function createQuickReply() {
    setSaving(true);
    const response = await fetch('/api/quick-replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: replyTitle,
        shortcut: replyShortcut || null,
        body: replyBody,
        departmentId: replyDepartmentId || null,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.error(payload.error || 'No se pudo crear');
    setReplyTitle('');
    setReplyShortcut('');
    setReplyBody('');
    toast.success('Respuesta rápida creada');
    await load();
  }

  if (loading) {
    return (
      <Loader2 className="text-primary mx-auto mt-16 size-6 animate-spin" />
    );
  }

  return (
    <div>
      <SettingsPanelHead
        title="Tickets y departamentos"
        description="Organiza la bandeja, los responsables y las respuestas reutilizables."
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <h3 className="text-foreground font-medium">Departamentos</h3>
              <p className="text-muted-foreground text-sm">
                Los departamentos inactivos conservan su historial y dejan de
                recibir tickets nuevos.
              </p>
            </div>

            {canEditSettings && (
              <div className="flex flex-wrap gap-2">
                <Input
                  value={newDepartmentName}
                  onChange={(event) => setNewDepartmentName(event.target.value)}
                  placeholder="Nombre del departamento"
                  className="min-w-52 flex-1"
                />
                <input
                  type="color"
                  value={newDepartmentColor}
                  onChange={(event) =>
                    setNewDepartmentColor(event.target.value)
                  }
                  className="border-border bg-background h-9 w-12 rounded-md border p-1"
                  aria-label="Color del departamento"
                />
                <Button
                  onClick={createDepartment}
                  disabled={saving || !newDepartmentName.trim()}
                >
                  <Plus className="mr-1 size-4" /> Crear
                </Button>
              </div>
            )}

            <div className="space-y-3">
              {departments.map((department) => {
                const departmentMemberships = memberships[department.id] ?? [];
                return (
                  <div
                    key={department.id}
                    className="border-border rounded-xl border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: department.color }}
                      />
                      <Building2 className="text-muted-foreground size-4" />
                      <span className="text-foreground font-medium">
                        {department.name}
                      </span>
                      <span className="text-muted-foreground ml-auto text-xs">
                        {department.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                      {canEditSettings && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleDepartment(department)}
                        >
                          {department.is_active ? 'Archivar' : 'Activar'}
                        </Button>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {departmentMemberships.map((membership) => {
                        const member = members.find(
                          (item) => item.user_id === membership.user_id
                        );
                        return (
                          <span
                            key={membership.id}
                            className="border-border bg-muted text-foreground inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs"
                          >
                            {member?.full_name || member?.email || 'Miembro'}
                            {membership.member_role === 'supervisor'
                              ? ' · Supervisor'
                              : ''}
                            {canEditSettings && (
                              <button
                                type="button"
                                onClick={() =>
                                  removeMember(
                                    department.id,
                                    membership.user_id
                                  )
                                }
                                aria-label="Quitar miembro"
                              >
                                <X className="size-3" />
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>

                    {canEditSettings && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <select
                          value={selectedUsers[department.id] ?? ''}
                          onChange={(event) =>
                            setSelectedUsers((prev) => ({
                              ...prev,
                              [department.id]: event.target.value,
                            }))
                          }
                          className="border-border bg-background text-foreground h-9 min-w-48 rounded-md border px-3 text-sm"
                        >
                          <option value="">Seleccionar miembro</option>
                          {members
                            .filter((member) => member.role !== 'viewer')
                            .map((member) => (
                              <option
                                key={member.user_id}
                                value={member.user_id}
                              >
                                {member.full_name || member.email}
                              </option>
                            ))}
                        </select>
                        <select
                          value={
                            selectedMembershipRoles[department.id] ?? 'member'
                          }
                          onChange={(event) =>
                            setSelectedMembershipRoles((prev) => ({
                              ...prev,
                              [department.id]: event.target.value as
                                'member' | 'supervisor',
                            }))
                          }
                          className="border-border bg-background text-foreground h-9 rounded-md border px-3 text-sm"
                        >
                          <option value="member">Ejecutivo</option>
                          <option value="supervisor">Supervisor</option>
                        </select>
                        <Button
                          variant="outline"
                          onClick={() => addMember(department.id)}
                        >
                          <UserPlus className="mr-1 size-4" /> Agregar
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <h3 className="text-foreground font-medium">
                Respuestas rápidas
              </h3>
              <p className="text-muted-foreground text-sm">
                Insertan texto en el editor; nunca se envían automáticamente.
              </p>
            </div>
            {canManageReplies && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={replyTitle}
                  onChange={(event) => setReplyTitle(event.target.value)}
                  placeholder="Título"
                />
                <Input
                  value={replyShortcut}
                  onChange={(event) => setReplyShortcut(event.target.value)}
                  placeholder="/atajo"
                />
                <select
                  value={replyDepartmentId}
                  onChange={(event) => setReplyDepartmentId(event.target.value)}
                  className="border-border bg-background text-foreground h-9 rounded-md border px-3 text-sm sm:col-span-2"
                >
                  {canEditSettings && (
                    <option value="">Todos los departamentos</option>
                  )}
                  {!canEditSettings && (
                    <option value="">Selecciona un departamento</option>
                  )}
                  {manageableReplyDepartments
                    .filter((item) => item.is_active)
                    .map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                </select>
                <Textarea
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder="Texto de la respuesta"
                  className="sm:col-span-2"
                />
                <Button
                  onClick={createQuickReply}
                  disabled={
                    saving ||
                    !replyTitle.trim() ||
                    !replyBody.trim() ||
                    (!canEditSettings && !replyDepartmentId)
                  }
                  className="sm:col-span-2 sm:justify-self-start"
                >
                  <Plus className="mr-1 size-4" /> Crear respuesta
                </Button>
              </div>
            )}
            <div className="divide-border divide-y">
              {quickReplies.length === 0 ? (
                <p className="text-muted-foreground py-4 text-sm">
                  No hay respuestas configuradas.
                </p>
              ) : (
                quickReplies.map((reply) => (
                  <div key={reply.id} className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-sm font-medium">
                        {reply.title}
                      </span>
                      {reply.shortcut && (
                        <code className="text-primary text-xs">
                          {reply.shortcut}
                        </code>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                      {reply.body}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
