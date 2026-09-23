'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type MemberRole = 'admin' | 'agent';

interface Department {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
}

interface CreateMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  planName?: string;
  currentUsers: number;
  maxUsers: number | null;
}

const ROLE_DESCRIPTION: Record<MemberRole, string> = {
  admin:
    'Administra usuarios, configuración y todas las operaciones de la empresa.',
  agent: 'Atiende conversaciones y trabaja en los departamentos asignados.',
};

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const random = new Uint32Array(12);
  crypto.getRandomValues(random);
  const suffix = Array.from(
    random,
    (value) => alphabet[value % alphabet.length]
  ).join('');
  return `Nxr-${suffix}-7`;
}

export function CreateMemberDialog({
  open,
  onOpenChange,
  onCreated,
  planName,
  currentUsers,
  maxUsers,
}: CreateMemberDialogProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<MemberRole>('agent');
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const usesDepartments = role === 'agent';
  const atLimit = maxUsers !== null && currentUsers >= maxUsers;
  const seatLabel = useMemo(
    () =>
      maxUsers === null
        ? `${currentUsers} usuarios · sin límite fijo`
        : `${currentUsers} de ${maxUsers} usuarios utilizados`,
    [currentUsers, maxUsers]
  );

  useEffect(() => {
    if (!open || departments.length > 0) return;
    let cancelled = false;
    setDepartmentsLoading(true);
    fetch('/api/departments', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('No se pudieron cargar los departamentos');
        return response.json() as Promise<{ departments?: Department[] }>;
      })
      .then((payload) => {
        if (!cancelled) {
          setDepartments(
            (payload.departments ?? []).filter(
              (department) => department.is_active
            )
          );
        }
      })
      .catch((error) => {
        console.error('[CreateMemberDialog] departments error', error);
        if (!cancelled) toast.error('No se pudieron cargar los departamentos');
      })
      .finally(() => {
        if (!cancelled) setDepartmentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, departments.length]);

  function reset() {
    setFullName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setRole('agent');
    setDepartmentIds([]);
    setSubmitting(false);
  }

  function setNextRole(nextRole: MemberRole) {
    setRole(nextRole);
    if (nextRole !== 'agent') {
      setDepartmentIds([]);
    }
  }

  function toggleDepartment(id: string, checked: boolean) {
    setDepartmentIds((current) =>
      checked
        ? [...new Set([...current, id])]
        : current.filter((departmentId) => departmentId !== id)
    );
  }

  async function copyPassword() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast.success('Contraseña copiada');
    } catch {
      toast.error('El navegador no permitió copiarla');
    }
  }

  async function handleCreate() {
    if (atLimit) {
      toast.error('La empresa ya alcanzó el límite de usuarios de su plan');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/account/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          password,
          role,
          departmentIds: usesDepartments ? departmentIds : [],
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        toast.error(payload.error ?? 'No se pudo crear el usuario');
        return;
      }

      toast.success(`Usuario ${fullName.trim()} creado correctamente`);
      onCreated();
      reset();
      onOpenChange(false);
    } catch (error) {
      console.error('[CreateMemberDialog] create error', error);
      toast.error('No se pudo conectar con el servidor');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="text-primary size-5" />
            Crear usuario
          </DialogTitle>
          <DialogDescription>
            Crea el acceso directamente. El agente ingresará con el correo y la
            contraseña que definas aquí.
          </DialogDescription>
        </DialogHeader>

        <div className="border-border bg-muted/35 flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs">
          <div>
            <p className="text-foreground font-semibold">
              Plan {planName ?? 'actual'}
            </p>
            <p className="text-muted-foreground mt-0.5">{seatLabel}</p>
          </div>
          <span
            className={
              atLimit
                ? 'font-semibold text-red-400'
                : 'font-semibold text-emerald-400'
            }
          >
            {atLimit ? 'Sin cupos' : 'Disponible'}
          </span>
        </div>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="member-full-name">Nombre completo</Label>
            <Input
              id="member-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Ej. Camila González"
              maxLength={80}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-email">Correo electrónico</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="agente@empresa.cl"
              maxLength={254}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="member-password">Contraseña de acceso</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPassword(generatePassword());
                  setShowPassword(true);
                }}
              >
                <RefreshCw className="size-3.5" /> Generar contraseña
              </Button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  id="member-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pr-10 pl-9"
                  placeholder="Mínimo 10 caracteres"
                  maxLength={128}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                  aria-label={
                    showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                  }
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyPassword}
                disabled={!password}
                aria-label="Copiar contraseña"
              >
                <Copy className="size-4" />
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              La define el administrador y el agente la utilizará para ingresar.
              No se le solicitará cambiarla; podrá hacerlo voluntariamente desde
              su perfil.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Rol</Label>
            <Select
              value={role}
              onValueChange={(value) =>
                value && setNextRole(value as MemberRole)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="agent">Agente</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {ROLE_DESCRIPTION[role]}
            </p>
          </div>

          {usesDepartments && (
            <div className="space-y-2">
              <Label>Departamentos asignados</Label>
              <div className="border-border bg-muted/20 max-h-40 space-y-1 overflow-y-auto rounded-xl border p-2">
                {departmentsLoading ? (
                  <div className="text-muted-foreground flex items-center gap-2 px-2 py-3 text-xs">
                    <Loader2 className="size-4 animate-spin" /> Cargando
                    departamentos…
                  </div>
                ) : departments.length === 0 ? (
                  <p className="text-muted-foreground px-2 py-3 text-xs">
                    No hay departamentos activos. Puedes crear el usuario y
                    asignarlo más adelante.
                  </p>
                ) : (
                  departments.map((department) => (
                    <label
                      key={department.id}
                      className="hover:bg-muted flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm"
                    >
                      <Checkbox
                        checked={departmentIds.includes(department.id)}
                        onCheckedChange={(checked) =>
                          toggleDepartment(department.id, checked === true)
                        }
                      />
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: department.color }}
                      />
                      <span>{department.name}</span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                Puedes seleccionar más de un departamento.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={submitting || atLimit}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Creando…
              </>
            ) : (
              <>
                <UserPlus className="size-4" /> Crear usuario
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
