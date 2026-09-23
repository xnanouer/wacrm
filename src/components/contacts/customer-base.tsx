'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRoundSearch,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import {
  CUSTOMER_BASE_EXPORT_LIMIT,
  CUSTOMER_BASE_PAGE_SIZE,
  EMPTY_CUSTOMER_BASE_FILTERS,
  customerBaseSearchParams,
  type CustomerBaseFilters,
  type CustomerBaseProfileFilter,
  type CustomerBaseRow,
  type CustomerBaseSource,
  type CustomerBaseTag,
} from '@/lib/contacts/customer-base';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface CustomerBaseResponse {
  rows: CustomerBaseRow[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
}

interface AgentOption {
  user_id: string;
  full_name: string | null;
  email: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'No informado';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Santiago',
  }).format(new Date(value));
}

function yesNo(value: boolean | null): string {
  if (value === null) return 'No informado';
  return value ? 'Sí' : 'No';
}

function sourceLabel(source: CustomerBaseSource | null): string {
  if (source === 'whatsapp') return 'WhatsApp';
  if (source === 'facebook') return 'Facebook';
  if (source === 'instagram') return 'Instagram';
  return 'Sin canal';
}

function sourceClass(source: CustomerBaseSource | null): string {
  if (source === 'whatsapp') return 'border-emerald-500/30 text-emerald-600';
  if (source === 'facebook') return 'border-blue-500/30 text-blue-600';
  if (source === 'instagram') return 'border-pink-500/30 text-pink-600';
  return '';
}

function selectClassName(): string {
  return 'border-input bg-background text-foreground h-9 min-w-0 rounded-lg border px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30';
}

function completionClass(completion: number): string {
  if (completion >= 100) return 'bg-emerald-500';
  if (completion >= 55) return 'bg-amber-500';
  return 'bg-primary';
}

function display(value: string | null | undefined): string {
  return value?.trim() || 'No informado';
}

function filterCount(filters: CustomerBaseFilters): number {
  return (
    Number(Boolean(filters.search.trim())) +
    filters.tagIds.length +
    Number(Boolean(filters.source)) +
    Number(filters.profile !== 'all') +
    Number(Boolean(filters.assignedAgentId)) +
    Number(Boolean(filters.departmentId)) +
    Number(Boolean(filters.evaluationStatus)) +
    Number(Boolean(filters.dateFrom)) +
    Number(Boolean(filters.dateTo))
  );
}

export function CustomerBase() {
  const supabase = createClient();
  const { accountId } = useAuth();
  const [filters, setFilters] = useState<CustomerBaseFilters>(
    EMPTY_CUSTOMER_BASE_FILTERS
  );
  const deferredSearch = useDeferredValue(filters.search);
  const effectiveFilters = useMemo(
    () => ({
      search: deferredSearch,
      tagIds: filters.tagIds,
      source: filters.source,
      profile: filters.profile,
      assignedAgentId: filters.assignedAgentId,
      departmentId: filters.departmentId,
      evaluationStatus: filters.evaluationStatus,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    }),
    [
      deferredSearch,
      filters.assignedAgentId,
      filters.dateFrom,
      filters.dateTo,
      filters.departmentId,
      filters.evaluationStatus,
      filters.profile,
      filters.source,
      filters.tagIds,
    ]
  );
  const [rows, setRows] = useState<CustomerBaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<CustomerBaseTag[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [evaluationStatuses, setEvaluationStatuses] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<CustomerBaseRow | null>(null);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const activeFilterCount = filterCount(filters);
  const totalPages = Math.max(1, Math.ceil(total / CUSTOMER_BASE_PAGE_SIZE));

  const updateFilter = useCallback(
    <Key extends keyof CustomerBaseFilters>(
      key: Key,
      value: CustomerBaseFilters[Key]
    ) => {
      setFilters((current) => ({ ...current, [key]: value }));
      setPage(1);
    },
    []
  );

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;

    async function loadOptions() {
      const [tagsResult, agentsResult, departmentsResult, statusesResult] =
        await Promise.all([
          supabase
            .from('tags')
            .select('id, name, color')
            .eq('account_id', accountId)
            .order('name'),
          supabase
            .from('profiles')
            .select('user_id, full_name, email')
            .eq('account_id', accountId)
            .order('full_name'),
          supabase
            .from('departments')
            .select('id, name')
            .eq('account_id', accountId)
            .eq('is_active', true)
            .order('position'),
          supabase
            .from('contacts')
            .select('evaluation_status')
            .eq('account_id', accountId)
            .not('evaluation_status', 'is', null),
        ]);

      if (cancelled) return;
      setTags((tagsResult.data ?? []) as CustomerBaseTag[]);
      setAgents((agentsResult.data ?? []) as AgentOption[]);
      setDepartments((departmentsResult.data ?? []) as DepartmentOption[]);
      setEvaluationStatuses(
        Array.from(
          new Set(
            (statusesResult.data ?? [])
              .map((row) => row.evaluation_status?.trim())
              .filter((value): value is string => Boolean(value))
          )
        ).sort((a, b) => a.localeCompare(b, 'es'))
      );
    }

    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [accountId, supabase]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRows() {
      setLoading(true);
      const params = customerBaseSearchParams(effectiveFilters);
      params.set('page', String(page));

      try {
        const response = await fetch(`/api/contacts/customer-base?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = (await response.json()) as CustomerBaseResponse;
        if (!response.ok) {
          throw new Error(payload.error || 'No se pudo cargar la base');
        }
        setRows(payload.rows);
        setTotal(payload.total);
      } catch (error) {
        if (controller.signal.aborted) return;
        toast.error(
          error instanceof Error
            ? error.message
            : 'No se pudo cargar la base de clientes'
        );
        setRows([]);
        setTotal(0);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadRows();
    return () => controller.abort();
  }, [effectiveFilters, page]);

  function toggleTag(tagId: string) {
    updateFilter(
      'tagIds',
      filters.tagIds.includes(tagId)
        ? filters.tagIds.filter((id) => id !== tagId)
        : [...filters.tagIds, tagId]
    );
  }

  function clearFilters() {
    setFilters(EMPTY_CUSTOMER_BASE_FILTERS);
    setPage(1);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const params = customerBaseSearchParams(filters);
      params.set('export', 'csv');
      const response = await fetch(`/api/contacts/customer-base?${params}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error || 'No se pudo generar el archivo');
      }

      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = filenameMatch?.[1] ?? 'clientes-nexora.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setExportConfirmOpen(false);
      toast.success('Archivo preparado para Excel');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo exportar'
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-primary mb-1 flex items-center gap-2 text-xs font-semibold tracking-[0.2em] uppercase">
            <UserRoundSearch className="size-4" />
            Inteligencia comercial
          </div>
          <h1 className="text-foreground text-2xl font-bold">
            Base de clientes
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Revisa la información confirmada por la IA y el equipo. Filtra los
            clientes que necesitas y exporta exactamente ese resultado.
          </p>
        </div>

        <Button
          onClick={() => setExportConfirmOpen(true)}
          disabled={loading || total === 0}
          className="shadow-primary/20 shadow-lg"
        >
          <FileSpreadsheet className="size-4" />
          Exportar resultados
        </Button>
      </div>

      <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              placeholder="Buscar por nombre, RUT, teléfono, vehículo, ejecutivo…"
              className="pl-9"
            />
          </div>

          <Popover>
            <PopoverTrigger
              render={
                <Button variant="outline" className="shrink-0 xl:w-auto" />
              }
            >
              <Filter className="size-4" />
              Etiquetas
              {filters.tagIds.length > 0 ? (
                <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[10px]">
                  {filters.tagIds.length}
                </span>
              ) : null}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
              <div className="border-border flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-semibold">
                  Mostrar si tiene alguna etiqueta
                </span>
                {filters.tagIds.length ? (
                  <button
                    type="button"
                    onClick={() => updateFilter('tagIds', [])}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    Limpiar
                  </button>
                ) : null}
              </div>
              <div className="max-h-72 overflow-y-auto p-1">
                {tags.length ? (
                  tags.map((tag) => (
                    <label
                      key={tag.id}
                      className="hover:bg-muted flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2"
                    >
                      <Checkbox
                        checked={filters.tagIds.includes(tag.id)}
                        onCheckedChange={() => toggleTag(tag.id)}
                      />
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="truncate text-sm">{tag.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-muted-foreground p-4 text-center text-sm">
                    Todavía no existen etiquetas.
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <select
            aria-label="Filtrar por canal"
            value={filters.source}
            onChange={(event) =>
              updateFilter(
                'source',
                event.target.value as CustomerBaseSource | ''
              )
            }
            className={selectClassName()}
          >
            <option value="">Todos los canales</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
          </select>

          <select
            aria-label="Filtrar por avance de ficha"
            value={filters.profile}
            onChange={(event) =>
              updateFilter(
                'profile',
                event.target.value as CustomerBaseProfileFilter
              )
            }
            className={selectClassName()}
          >
            <option value="all">Todas las fichas</option>
            <option value="complete">Ficha completa</option>
            <option value="incomplete">Ficha incompleta</option>
            <option value="with_data">Con información</option>
            <option value="without_data">Sin información</option>
          </select>

          <Button
            type="button"
            variant={advancedOpen ? 'secondary' : 'outline'}
            onClick={() => setAdvancedOpen((value) => !value)}
          >
            <SlidersHorizontal className="size-4" />
            Más filtros
          </Button>
        </div>

        {advancedOpen ? (
          <div className="border-border mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 xl:grid-cols-5">
            <select
              aria-label="Filtrar por ejecutivo"
              value={filters.assignedAgentId}
              onChange={(event) =>
                updateFilter('assignedAgentId', event.target.value)
              }
              className={selectClassName()}
            >
              <option value="">Todos los ejecutivos</option>
              {agents.map((agent) => (
                <option key={agent.user_id} value={agent.user_id}>
                  {agent.full_name || agent.email}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar por departamento"
              value={filters.departmentId}
              onChange={(event) =>
                updateFilter('departmentId', event.target.value)
              }
              className={selectClassName()}
            >
              <option value="">Todos los departamentos</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar por estado comercial"
              value={filters.evaluationStatus}
              onChange={(event) =>
                updateFilter('evaluationStatus', event.target.value)
              }
              className={selectClassName()}
            >
              <option value="">Todos los estados</option>
              {evaluationStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <label className="relative">
              <span className="text-muted-foreground bg-background absolute -top-2 left-2 px-1 text-[10px]">
                Desde
              </span>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(event) =>
                  updateFilter('dateFrom', event.target.value)
                }
              />
            </label>

            <label className="relative">
              <span className="text-muted-foreground bg-background absolute -top-2 left-2 px-1 text-[10px]">
                Hasta
              </span>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(event) => updateFilter('dateTo', event.target.value)}
              />
            </label>
          </div>
        ) : null}

        {activeFilterCount > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs">
              {activeFilterCount} filtro{activeFilterCount === 1 ? '' : 's'}
              activo{activeFilterCount === 1 ? '' : 's'}
            </span>
            {filters.tagIds.map((id) => {
              const tag = tags.find((candidate) => candidate.id === id);
              if (!tag) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleTag(id)}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
                  style={{
                    backgroundColor: `${tag.color}18`,
                    color: tag.color,
                  }}
                >
                  {tag.name}
                  <X className="size-3" />
                </button>
              );
            })}
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpiar todo
            </Button>
          </div>
        ) : null}
      </div>

      <div className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
        <div className="border-border flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-foreground text-sm font-semibold">
              {total.toLocaleString('es-CL')} cliente
              {total === 1 ? '' : 's'} encontrado{total === 1 ? '' : 's'}
            </p>
            <p className="text-muted-foreground text-xs">
              Selecciona una fila para revisar toda la ficha.
            </p>
          </div>
          {activeFilterCount > 0 ? (
            <Badge variant="secondary">Resultado filtrado</Badge>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-[1120px]">
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Vehículo</TableHead>
                <TableHead>Etiquetas</TableHead>
                <TableHead>Ejecutivo</TableHead>
                <TableHead>Ficha</TableHead>
                <TableHead>Último contacto</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-52 text-center">
                    <Loader2 className="text-primary mx-auto mb-2 size-6 animate-spin" />
                    <span className="text-muted-foreground text-sm">
                      Preparando la base de clientes…
                    </span>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-52 text-center">
                    <UserRoundSearch className="text-muted-foreground mx-auto mb-3 size-9" />
                    <p className="text-foreground font-medium">
                      No encontramos clientes con estos filtros
                    </p>
                    <Button
                      variant="link"
                      className="mt-1"
                      onClick={clearFilters}
                    >
                      Mostrar toda la base
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow
                    key={row.contact_id}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() => setSelectedRow(row)}
                  >
                    <TableCell>
                      <p className="text-foreground max-w-52 truncate font-semibold">
                        {row.full_name}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        RUT: {row.rut || 'No entregado'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-foreground text-sm">{row.phone}</p>
                      <Badge
                        variant="outline"
                        className={cn('mt-1', sourceClass(row.source))}
                      >
                        {sourceLabel(row.source)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="max-w-48 truncate text-sm">
                        {row.vehicle_interest || 'No informado'}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Pie: {row.down_payment || 'No informado'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-52 flex-wrap gap-1">
                        {row.tags.length ? (
                          row.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag.id}
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={{
                                backgroundColor: `${tag.color}18`,
                                color: tag.color,
                              }}
                            >
                              {tag.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            Sin etiquetas
                          </span>
                        )}
                        {row.tags.length > 3 ? (
                          <span className="text-muted-foreground text-[10px]">
                            +{row.tags.length - 3}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="max-w-40 truncate text-sm">
                        {row.assigned_agent_name || 'Sin asignar'}
                      </p>
                      <p className="text-muted-foreground mt-0.5 max-w-40 truncate text-xs">
                        {row.department_name || 'Sin departamento'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-28 items-center justify-between gap-2 text-xs">
                        <span>{row.profile_completion}%</span>
                        {row.profile_completion === 100 ? (
                          <CheckCircle2 className="size-4 text-emerald-500" />
                        ) : null}
                      </div>
                      <div className="bg-muted mt-1.5 h-1.5 w-28 overflow-hidden rounded-full">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            completionClass(row.profile_completion)
                          )}
                          style={{ width: `${row.profile_completion}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(row.last_contact_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedRow(row);
                        }}
                      >
                        Ver ficha
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {!loading && total > 0 ? (
          <div className="border-border flex items-center justify-between border-t px-4 py-3">
            <p className="text-muted-foreground text-xs">
              Mostrando {(page - 1) * CUSTOMER_BASE_PAGE_SIZE + 1}–
              {Math.min(page * CUSTOMER_BASE_PAGE_SIZE, total)} de{' '}
              {total.toLocaleString('es-CL')}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                aria-label="Página anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-muted-foreground min-w-20 text-center text-xs">
                {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                aria-label="Página siguiente"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <CustomerProfileDialog
        row={selectedRow}
        onOpenChange={(open) => {
          if (!open) setSelectedRow(null);
        }}
      />

      <Dialog open={exportConfirmOpen} onOpenChange={setExportConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="bg-primary/10 text-primary mb-1 flex size-10 items-center justify-center rounded-xl">
              <Download className="size-5" />
            </div>
            <DialogTitle>Exportar base de clientes</DialogTitle>
            <DialogDescription>
              Se descargarán{' '}
              {Math.min(total, CUSTOMER_BASE_EXPORT_LIMIT).toLocaleString(
                'es-CL'
              )}{' '}
              registros que coinciden con los filtros actuales. El archivo CSV
              abre directamente en Excel.
            </DialogDescription>
          </DialogHeader>

          <div className="border-border bg-muted/40 space-y-3 rounded-xl border p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" />
              <div>
                <p className="text-foreground text-sm font-semibold">
                  Contiene información personal
                </p>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  Guarda el archivo en un lugar protegido y compártelo solo con
                  personas autorizadas de tu empresa. La exportación quedará
                  registrada en Nexora.
                </p>
              </div>
            </div>
            {activeFilterCount > 0 ? (
              <p className="text-muted-foreground border-border border-t pt-3 text-xs">
                Se aplicarán {activeFilterCount} filtro
                {activeFilterCount === 1 ? '' : 's'}.
              </p>
            ) : (
              <p className="border-border border-t pt-3 text-xs font-medium text-amber-600">
                No hay filtros: se exportará toda la base visible de la empresa.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExportConfirmOpen(false)}
              disabled={exporting}
            >
              Cancelar
            </Button>
            <Button onClick={() => void exportCsv()} disabled={exporting}>
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="size-4" />
              )}
              {exporting ? 'Preparando…' : 'Descargar para Excel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerProfileDialog({
  row,
  onOpenChange,
}: {
  row: CustomerBaseRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const profileFields = row
    ? [
        ['Nombre completo', row.full_name],
        ['RUT', row.rut],
        ['Teléfono', row.phone],
        ['Correo', row.email],
        ['Ciudad o comuna', row.city],
        ['Vehículo que busca', row.vehicle_interest],
        ['Pie disponible', row.down_payment],
        ['Acredita ingresos', yesNo(row.income_proof)],
        ['Tipo de contrato', row.employment_type],
        ['Antigüedad laboral', row.employment_tenure],
        ['Presenta DICOM', yesNo(row.has_dicom)],
        ['Solicita financiamiento', yesNo(row.financing_requested)],
        ['Entrega vehículo en parte de pago', yesNo(row.trade_in)],
        ['Detalle de parte de pago', row.trade_in_vehicle],
        ['Cuándo desea comprar', row.purchase_timeline],
      ]
    : [];

  return (
    <Dialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {row ? (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3 pr-8">
                <div className="bg-primary/10 text-primary flex size-12 shrink-0 items-center justify-center rounded-2xl">
                  <CircleUserRound className="size-6" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="truncate text-xl">
                    {row.full_name}
                  </DialogTitle>
                  <DialogDescription className="mt-1">
                    Ficha consolidada con los datos confirmados durante la
                    conversación.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-3">
              <ProfileSummaryCard
                icon={CheckCircle2}
                label="Avance de la ficha"
                value={`${row.profile_completion}%`}
                detail={`${row.profile_completed_fields} de 11 grupos confirmados`}
              />
              <ProfileSummaryCard
                icon={CircleUserRound}
                label="Ejecutivo"
                value={row.assigned_agent_name || 'Sin asignar'}
                detail={row.department_name || 'Sin departamento'}
              />
              <ProfileSummaryCard
                icon={CalendarDays}
                label="Último contacto"
                value={formatDate(row.last_contact_at)}
                detail={sourceLabel(row.source)}
              />
            </div>

            <section className="border-border overflow-hidden rounded-2xl border">
              <div className="border-border bg-muted/40 border-b px-4 py-3">
                <h3 className="text-foreground font-semibold">
                  Información recabada
                </h3>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  “No informado” significa que el cliente todavía no confirmó
                  ese dato.
                </p>
              </div>
              <div className="grid sm:grid-cols-2">
                {profileFields.map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="border-border/70 flex items-start justify-between gap-4 border-b px-4 py-3 odd:sm:border-r"
                  >
                    <span className="text-muted-foreground text-xs">
                      {label}
                    </span>
                    <span className="text-foreground max-w-[60%] text-right text-sm font-medium">
                      {display(value)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <section className="border-border rounded-2xl border p-4">
                <h3 className="text-foreground text-sm font-semibold">
                  Etiquetas y estado
                </h3>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {row.tags.length ? (
                    row.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="rounded-full px-2.5 py-1 text-xs font-semibold"
                        style={{
                          backgroundColor: `${tag.color}18`,
                          color: tag.color,
                        }}
                      >
                        {tag.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      Sin etiquetas
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-4 text-xs">
                  Estado comercial:{' '}
                  <span className="text-foreground font-medium">
                    {row.evaluation_status || 'No informado'}
                  </span>
                </p>
              </section>

              <section className="border-border rounded-2xl border p-4">
                <h3 className="text-foreground text-sm font-semibold">
                  Seguimiento
                </h3>
                <div className="text-muted-foreground mt-3 space-y-2 text-xs">
                  <p>
                    Próximo seguimiento:{' '}
                    <span className="text-foreground font-medium">
                      {formatDate(row.next_follow_up_at)}
                    </span>
                  </p>
                  <p>
                    Conversación:{' '}
                    <span className="text-foreground font-medium">
                      {row.conversation_status || 'Sin conversación'}
                    </span>
                  </p>
                </div>
              </section>
            </div>

            <p className="text-muted-foreground flex items-start gap-2 text-[11px] leading-5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              El RUT, DICOM e ingresos son datos declarados por el cliente. No
              equivalen a una evaluación financiera ni a una aprobación.
            </p>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProfileSummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border-border bg-muted/30 rounded-xl border p-3">
      <div className="text-muted-foreground flex items-center gap-2 text-[11px] font-semibold tracking-wide uppercase">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="text-foreground mt-2 truncate text-sm font-semibold">
        {value}
      </p>
      <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
        {detail}
      </p>
    </div>
  );
}
