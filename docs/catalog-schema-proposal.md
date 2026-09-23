# Propuesta estructural: Catálogo Nexora

Estado: **aplicado y verificado el 28 de julio de 2026**.

El SQL aprobado se encuentra en
[`supabase/migrations/051_catalog.sql`](../supabase/migrations/051_catalog.sql).
El archivo fue promovido a migración después de la autorización de la Etapa 4.
Este documento conserva las decisiones y el procedimiento de rollback.

Migraciones activas:

- `051_catalog.sql`: tablas, límites, RLS, Storage y ciclo de vida.
- `052_catalog_persistence_rpcs.sql`: creación, edición y registro de imágenes
  mediante RPC transaccionales.
- `053_catalog_image_order_guard.sql`: protección de orden para galerías
  existentes.

## Decisiones incorporadas

- La empresa se identifica exclusivamente mediante `account_id`.
- La primera versión pública conserva los roles Administrador y Agente.
- Los roles internos `owner`, `admin` y `supervisor` pueden aprobar.
- El Agente puede preparar y administrar solamente sus propios borradores.
- El plan `trial` recibe 50 unidades, igual que Starter.
- Los límites son capacidad simultánea, no consumo que se reinicia cada mes.
- El bloque adicional contiene 10 unidades y conserva el precio de referencia
  de $5.990 CLP al momento de asignarlo.
- No existe eliminación permanente como operación normal.
- No se implementan pagos, IVA, IA ni envíos automáticos.
- El navegador no recibe permisos de escritura directa sobre las tablas del
  catálogo.

## Tablas nuevas

| Tabla                          | Responsabilidad                                 |
| ------------------------------ | ----------------------------------------------- |
| `account_catalog_entitlements` | Bloques adicionales asignados a una empresa     |
| `catalog_items`                | Núcleo genérico y extensible del catálogo       |
| `catalog_vehicle_details`      | Información específica de vehículos             |
| `catalog_item_images`          | Fotografías, orden e imagen principal           |
| `catalog_approvals`            | Solicitudes, aprobaciones y rechazos            |
| `catalog_item_activity`        | Auditoría inmutable                             |
| `catalog_share_batches`        | Una operación de compartir hasta cinco unidades |
| `catalog_item_shares`          | Resultado y snapshot de cada vehículo enviado   |
| `contact_catalog_interests`    | Relación entre contactos y vehículos            |

También se propone agregar `max_active_catalog_items` a `saas_plans`.

## Límites definidos

| Código interno | Nombre comercial | Límite |
| -------------- | ---------------- | -----: |
| `trial`        | Prueba           |     50 |
| `starter`      | Starter          |     50 |
| `professional` | Pro              |    150 |
| `enterprise`   | Business         |    500 |

Consumen capacidad:

- `draft`
- `pending_approval`
- `available`
- `reserved`

No consumen capacidad:

- `sold`
- `inactive`
- `archived`

La función `enforce_catalog_capacity()` utiliza un advisory lock por
`account_id`. Esto impide que dos solicitudes concurrentes ocupen
simultáneamente el último cupo.

Los triggers adicionales bloquean:

- disminuir bloques por debajo del uso actual;
- cambiar a un plan cuya capacidad sea menor que las unidades utilizadas;
- mover un vehículo de una empresa a otra.

La reducción de bloques, el cambio de plan y la ocupación del último cupo usan
el mismo bloqueo transaccional por empresa. Un cambio de fechas de vigencia
también se considera una posible reducción.

## Reglas multiempresa

Se agregan claves compuestas `(id, account_id)` a las entidades existentes que
el catálogo necesita referenciar:

- `contacts`
- `conversations`
- `deals`

Cada relación sensible utiliza una foreign key compuesta. Esto impide desde la
base de datos relacionar, por ejemplo, el vehículo de una empresa con el
contacto o conversación de otra.

Los identificadores de mensajes se validarán además contra la conversación en
la ruta backend de envío, porque `messages` deriva la empresa desde
`conversation_id` y actualmente no almacena `account_id` propio. La conexión
seleccionada también deberá coincidir con el canal y la conexión de esa
conversación; no bastará con que pertenezca a la misma empresa.

## Permisos RLS

### Administrador

- Ve todo el catálogo de su empresa.
- Ve aprobaciones, actividad, compartidos e intereses.
- Ve la capacidad contratada y sus bloques adicionales.
- Las escrituras pasan por backend o RPC.
- Puede aprobar, rechazar y cambiar estados mediante RPC.

### Agente

- Ve vehículos disponibles o reservados.
- Ve los vehículos creados por él.
- Puede recuperar el historial de un vehículo previamente compartido en una
  conversación que tenga permiso para ver.
- Ve la auditoría completa únicamente de los vehículos creados por él.
- No obtiene permisos SQL directos para cambiar precios, estados o aprobaciones.

### Viewer heredado

- Conserva lectura interna de la empresa.
- No recibe permisos de escritura.

### Escrituras

Se revocan `INSERT`, `UPDATE` y `DELETE` de las tablas del catálogo para
`authenticated`.

Las operaciones se dividen en:

1. Rutas backend que derivan `account_id` y `user_id` de la sesión.
2. RPC de ciclo de vida con validación transaccional.

El SQL incluye:

- `submit_catalog_item(uuid)`
- `review_catalog_item(uuid, decision, reason)`
- `set_catalog_item_status(uuid, status)`
- `catalog_capacity_snapshot()`

La creación y edición detallada se implementará en la etapa de persistencia
mediante rutas backend. Esas rutas no deberán aceptar `account_id`, estado
aprobado, usuario aprobador ni cupos desde el navegador.

## Auditoría

Los triggers escriben automáticamente en `catalog_item_activity` cuando:

- se crea un vehículo;
- cambia de estado;
- cambia información técnica o comercial;
- cambia el precio;
- se agrega o elimina una imagen;
- se envía correctamente;
- se marca como interés principal.

`catalog_approvals` conserva además:

- snapshot revisado;
- solicitante;
- revisor;
- decisión;
- motivo del rechazo;
- fechas.

Las tablas de compartidos guardan el snapshot comercial enviado. Cambiar el
precio actual del vehículo no modifica el precio histórico mostrado al
cliente.

La coincidencia exacta de patente se indexa para detectarla rápidamente, pero
no se impone como restricción única permanente: una unidad vendida o archivada
podría regresar legítimamente al inventario. La ruta de creación deberá
mostrar la advertencia y solicitar confirmación antes de continuar.

## Aprobaciones y notificaciones

El flujo propuesto es:

```text
Borrador
   ↓ submit_catalog_item()
Pendiente de aprobación
   ↓ review_catalog_item()
Disponible o nuevamente Borrador
```

Antes de enviarlo a aprobación se exige:

- ficha técnica existente;
- imagen principal existente.

La tabla existente `notifications` se amplía con:

- `catalog_approval_requested`
- `catalog_item_approved`
- `catalog_item_rejected`

No se crea un segundo sistema de notificaciones.

## Storage propuesto

Bucket:

```text
catalog-media
```

Configuración:

- privado;
- máximo 5 MB por imagen;
- JPEG, PNG y WebP;
- sin lectura pública.

Ruta obligatoria:

```text
account-<account_id>/vehicles/<catalog_item_id>/<image_id>.<extension>
```

Políticas:

- lectura: solamente quien pueda ver el vehículo;
- subida: solamente quien pueda administrar el vehículo;
- actualización: misma empresa y mismo vehículo;
- eliminación: misma empresa y permiso de administración.

Para mostrar imágenes, el backend emitirá URLs firmadas temporales.

Para WhatsApp se utilizará una URL firmada con vigencia suficiente para que el
proveedor descargue la imagen. Facebook e Instagram continuarán en modo texto
hasta ampliar la integración social.

## Impacto sobre datos actuales

- No se elimina ni reescribe información existente.
- Se agregan tres constraints únicas compuestas sobre columnas que ya poseen
  una clave primaria; no deberían producir conflictos.
- Se actualiza únicamente el catálogo de planes con los nuevos límites.
- Las empresas existentes comienzan con cero bloques adicionales.
- No se crean vehículos de ejemplo en la base de datos.
- No se importan datos desde `contacts.interest_product`.
- `contacts.interest_product` permanece intacto por compatibilidad.
- No se modifica el funcionamiento actual de mensajes o conversaciones.

## Riesgos y controles operativos

1. Se confirmó que las migraciones 027, 031, 034, 044, 045, 049 y 050 estaban
   aplicadas antes de ejecutar la 051.
2. Comprobar que `whatsapp_config(id, account_id)` conserva su índice único
   compuesto.
3. Probar el SQL primero en una rama o proyecto Supabase de ensayo.
4. Las URLs firmadas deben durar lo suficiente para que WhatsApp descargue la
   fotografía.
5. Un batch puede terminar `partial`: cada resultado debe registrarse de forma
   independiente.
6. El proveedor puede aceptar el mensaje y fallar después la persistencia
   local. El orquestador debe usar claves de idempotencia.
7. Un bloque con fecha de término puede dejar una empresa sobre el límite. En
   ese caso se conservan sus datos, pero no podrá activar nuevas unidades hasta
   liberar capacidad.
8. No debe exponerse el `service_role` al navegador.
9. El motivo técnico de un error de proveedor se guarda internamente, pero la
   interfaz debe mostrar un mensaje seguro.
10. Las fotografías no deben copiarse a `chat-media`, porque ese bucket es
    público.

## Registro de aplicación

1. Se comparó el historial local/remoto: `001` a `050` coincidían.
2. Se simuló `051` con `db push --dry-run`.
3. El primer intento detectó que `uuid_generate_v4()` estaba en `extensions`;
   la transacción revirtió todo.
4. Se calificó la función como `extensions.uuid_generate_v4()`.
5. Se aplicaron `051`, `052` y `053`.
6. Se confirmó el historial remoto hasta `053`.
7. El lint remoto de `public` y `storage` terminó sin errores.
8. Se verificaron las nueve tablas, los límites y el bucket privado mediante
   consultas de solo lectura.

## Estrategia de rollback

### Rollback seguro recomendado

Si la aplicación falla después de aplicar la migración:

1. Ocultar el módulo Catálogo y el botón de la Bandeja.
2. Mantener tablas e imágenes intactas.
3. Revocar temporalmente los RPC de ciclo de vida.
4. Corregir la aplicación o las políticas.
5. Rehabilitar sin pérdida de datos.

Este rollback no elimina información.

### Rollback estructural completo

Solo debe utilizarse después de respaldar tablas y descargar todos los objetos
de `catalog-media`. Es destructivo y no debe ejecutarse automáticamente.

```sql
BEGIN;

DROP TRIGGER IF EXISTS normalize_catalog_image_insert
  ON public.catalog_item_images;
DROP FUNCTION IF EXISTS public.normalize_catalog_image_insert();

DROP TRIGGER IF EXISTS on_catalog_approval_notification
  ON public.catalog_approvals;
DROP TRIGGER IF EXISTS on_primary_catalog_interest_audit
  ON public.contact_catalog_interests;
DROP TRIGGER IF EXISTS on_catalog_share_audit
  ON public.catalog_item_shares;
DROP TRIGGER IF EXISTS on_catalog_image_audit
  ON public.catalog_item_images;
DROP TRIGGER IF EXISTS on_catalog_vehicle_details_audit
  ON public.catalog_vehicle_details;
DROP TRIGGER IF EXISTS on_catalog_item_audit
  ON public.catalog_items;
DROP TRIGGER IF EXISTS guard_catalog_plan_downgrade ON public.accounts;
DROP TRIGGER IF EXISTS guard_catalog_entitlement_reduction
  ON public.account_catalog_entitlements;
DROP TRIGGER IF EXISTS enforce_catalog_capacity ON public.catalog_items;

DROP POLICY IF EXISTS "Catalog media authorized delete" ON storage.objects;
DROP POLICY IF EXISTS "Catalog media authorized update" ON storage.objects;
DROP POLICY IF EXISTS "Catalog media authorized upload" ON storage.objects;
DROP POLICY IF EXISTS "Catalog media account read" ON storage.objects;

-- Stop here unless every catalog-media object has been backed up.
DELETE FROM storage.objects WHERE bucket_id = 'catalog-media';
DELETE FROM storage.buckets WHERE id = 'catalog-media';

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_subject_check;
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned'));
ALTER TABLE public.notifications
  DROP COLUMN IF EXISTS catalog_item_id;

DROP TABLE IF EXISTS public.contact_catalog_interests;
DROP TABLE IF EXISTS public.catalog_item_shares;
DROP TABLE IF EXISTS public.catalog_share_batches;
DROP TABLE IF EXISTS public.catalog_item_activity;
DROP TABLE IF EXISTS public.catalog_approvals;
DROP TABLE IF EXISTS public.catalog_item_images;
DROP TABLE IF EXISTS public.catalog_vehicle_details;
DROP TABLE IF EXISTS public.catalog_items;
DROP TABLE IF EXISTS public.account_catalog_entitlements;

DROP FUNCTION IF EXISTS public.notify_catalog_approval();
DROP FUNCTION IF EXISTS public.register_catalog_item_image(
  UUID,
  UUID,
  TEXT,
  TEXT,
  BIGINT,
  INTEGER,
  INTEGER,
  TEXT,
  INTEGER,
  BOOLEAN
);
DROP FUNCTION IF EXISTS public.update_catalog_vehicle(UUID, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS public.create_catalog_vehicle(JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS public.set_catalog_item_status(UUID, TEXT);
DROP FUNCTION IF EXISTS public.review_catalog_item(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.submit_catalog_item(UUID);
DROP FUNCTION IF EXISTS public.guard_catalog_plan_downgrade();
DROP FUNCTION IF EXISTS public.guard_catalog_entitlement_reduction();
DROP FUNCTION IF EXISTS public.enforce_catalog_capacity();
DROP FUNCTION IF EXISTS public.catalog_capacity_snapshot();
DROP FUNCTION IF EXISTS public.catalog_active_usage(UUID);
DROP FUNCTION IF EXISTS public.catalog_capacity_limit(UUID);
DROP FUNCTION IF EXISTS public.catalog_status_consumes_capacity(TEXT);
DROP FUNCTION IF EXISTS public.catalog_can_view_contact(UUID);
DROP FUNCTION IF EXISTS public.catalog_can_manage_item(UUID);
DROP FUNCTION IF EXISTS public.catalog_can_view_item(UUID);
DROP FUNCTION IF EXISTS public.audit_primary_catalog_interest();
DROP FUNCTION IF EXISTS public.audit_catalog_share();
DROP FUNCTION IF EXISTS public.audit_catalog_image();
DROP FUNCTION IF EXISTS public.audit_catalog_vehicle_details();
DROP FUNCTION IF EXISTS public.audit_catalog_item_row();

ALTER TABLE public.saas_plans
  DROP COLUMN IF EXISTS max_active_catalog_items;

ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_id_account_unique;
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_id_account_unique;
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_id_account_unique;

NOTIFY pgrst, 'reload schema';
COMMIT;
```

## Criterio de aprobación

Antes de convertir el archivo en una migración activa deben aprobarse
explícitamente:

1. Las nueve tablas.
2. El bucket privado.
3. Los límites de `trial`, Starter, Pro y Business.
4. La matriz Administrador/Agente.
5. Las extensiones de `notifications`.
6. Los RPC de aprobación y estados.
7. El rollback destructivo como procedimiento de emergencia, no automático.
