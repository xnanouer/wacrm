-- Starter knowledge for the official Nexora support assistant.
-- Fixed IDs make this seed idempotent. Existing creator edits are preserved.

INSERT INTO public.platform_support_documents
  (id, title, category, content, status, published_at)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Primeros pasos en Nexora', 'Primeros pasos',
   'Nexora centraliza la operación de una empresa. Resumen muestra indicadores para administradores; Bandeja concentra conversaciones; Configuración contiene empresa, usuarios y conexiones. Los agentes operativos comienzan normalmente en Bandeja. Ayuda y soporte abre Nexora Asistente. Cada usuario pertenece a una sola empresa y los datos se filtran por account_id.', 'published', NOW()),
  ('10000000-0000-4000-8000-000000000002', 'Conectar WhatsApp mediante QR', 'Conexiones de WhatsApp',
   'Un administrador abre Configuración y el apartado de canales o WhatsApp. Crea o selecciona una conexión WhatsApp QR, inicia la sesión y escanea el código desde WhatsApp en Dispositivos vinculados. La sesión depende del worker de WhatsApp Web del servidor. Si aparece desconectado, revise primero el estado del worker y vuelva a escanear solo cuando Nexora indique que la sesión expiró. Nunca comparta el código QR ni claves.', 'published', NOW()),
  ('10000000-0000-4000-8000-000000000003', 'Facebook e Instagram', 'Facebook e Instagram',
   'Facebook Messenger e Instagram se conectan desde Configuración mediante la aplicación central de Meta autorizada por Nexora. El administrador autoriza solamente las páginas que gestiona. WhatsApp QR no conecta automáticamente Facebook ni Instagram. En producción Meta necesita un dominio HTTPS, una URL de webhook pública y la aplicación aprobada con los permisos correspondientes.', 'published', NOW()),
  ('10000000-0000-4000-8000-000000000004', 'Usuarios, roles y permisos', 'Usuarios y permisos',
   'Dentro de una empresa, Administrador configura la cuenta, crea usuarios, revisa contactos, planes, agentes IA y automatizaciones. Agente trabaja principalmente con Bandeja, Catálogo y Cotizaciones según sus permisos. Plataforma Nexora es un control global separado y solo aparece para correos autorizados como propietarios globales. Ocultar un enlace no es la seguridad: las rutas y RLS también validan el rol en el servidor.', 'published', NOW()),
  ('10000000-0000-4000-8000-000000000005', 'Planes, pagos y límites', 'Planes y pagos',
   'Planes y pagos muestra el plan actual, usuarios, conexiones, capacidad de catálogo y Puntos Nexora. Los adicionales modifican capacidad y precio mensual. Una compra real solo continúa cuando Mercado Pago está configurado por el creador de la plataforma. Si el proveedor no está configurado, Nexora debe informar que el pago no está disponible y no simular una suscripción.', 'published', NOW()),
  ('10000000-0000-4000-8000-000000000006', 'Agentes IA comerciales', 'Agentes IA',
   'El Agente IA de una empresa atiende a sus clientes y usa solamente la configuración, conocimiento, catálogo y conversaciones de esa misma empresa. Es distinto de Nexora Asistente, que resuelve dudas sobre la plataforma. El administrador activa el agente comercial y define personalidad, negocio, preguntas frecuentes, horarios, conexiones, permisos, calificación y derivaciones. La credencial del proveedor es administrada en el servidor por Nexora y nunca se muestra a usuarios de empresas.', 'published', NOW()),
  ('10000000-0000-4000-8000-000000000007', 'Automatizaciones y flujos', 'Automatizaciones',
   'Automatizaciones ejecuta reglas sobre eventos configurados y debe revisarse en su historial antes de activarlas. Flujos permite construir recorridos conversacionales y mantiene la etiqueta Beta. Para diagnosticar una automatización, revise que esté activa, el evento de inicio, sus condiciones, los pasos y el registro de ejecución. No active una regla solo para probarla con datos reales sin revisar primero sus acciones.', 'published', NOW()),
  ('10000000-0000-4000-8000-000000000008', 'Catálogo y cotizaciones', 'Catálogo y cotizaciones',
   'Cada empresa mantiene su propio Catálogo. Un vehículo debe estar aprobado y disponible para compartirse. Desde Bandeja un agente puede seleccionar un vehículo y enviar su ficha al contacto. Cotizaciones permite elegir cliente, vehículo, precio, pie, cuotas, vigencia y ejecutivo; después genera un documento que puede enviarse al contacto cuando existe una conexión compatible.', 'published', NOW()),
  ('10000000-0000-4000-8000-000000000009', 'Cuándo escalar un problema', 'Problemas frecuentes',
   'Nexora Asistente debe escalar cuando el usuario solicita una persona o reunión, no existe documentación suficiente, la solución ya se intentó sin resultado, una herramienta falla, o el asunto involucra facturación, seguridad o pérdida de datos. El caso debe incluir un resumen, ruta, pasos intentados y errores redactados. Una reunión solo se confirma cuando Google Calendar está conectado y el evento fue creado realmente.', 'published', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.platform_support_chunks (document_id, chunk_index, content)
SELECT document.id, 0, document.content
FROM public.platform_support_documents document
WHERE document.id IN (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000007',
  '10000000-0000-4000-8000-000000000008',
  '10000000-0000-4000-8000-000000000009'
)
ON CONFLICT (document_id, chunk_index) DO NOTHING;

CREATE OR REPLACE FUNCTION public.platform_support_statistics()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH totals AS (
    SELECT
      COUNT(*)::NUMERIC AS conversations,
      COUNT(*) FILTER (WHERE resolution_type = 'ai_resolved')::NUMERIC AS ai_resolved,
      COUNT(*) FILTER (WHERE escalated_at IS NOT NULL)::NUMERIC AS escalated,
      AVG(EXTRACT(EPOCH FROM (closed_at - created_at))) FILTER (WHERE closed_at IS NOT NULL) AS avg_resolution_seconds
    FROM public.platform_support_conversations
  )
  SELECT jsonb_build_object(
    'conversations_started', totals.conversations,
    'resolved_by_ai', totals.ai_resolved,
    'resolved_by_ai_percent', CASE WHEN totals.conversations = 0 THEN 0 ELSE ROUND(totals.ai_resolved * 100 / totals.conversations, 1) END,
    'escalated', totals.escalated,
    'escalated_percent', CASE WHEN totals.conversations = 0 THEN 0 ELSE ROUND(totals.escalated * 100 / totals.conversations, 1) END,
    'meetings_booked', (SELECT COUNT(*) FROM public.platform_support_bookings WHERE status = 'confirmed'),
    'average_resolution_seconds', COALESCE(ROUND(totals.avg_resolution_seconds), 0),
    'positive_feedback', (SELECT COUNT(*) FROM public.platform_support_conversations WHERE feedback = 'resolved'),
    'partial_feedback', (SELECT COUNT(*) FROM public.platform_support_conversations WHERE feedback = 'partial'),
    'negative_feedback', (SELECT COUNT(*) FROM public.platform_support_conversations WHERE feedback = 'needs_support'),
    'top_companies', COALESCE((
      SELECT jsonb_agg(company_row ORDER BY cases DESC)
      FROM (
        SELECT account.name, COUNT(*) AS cases
        FROM public.platform_support_tickets ticket
        JOIN public.accounts account ON account.id = ticket.account_id
        GROUP BY account.id, account.name
        ORDER BY cases DESC
        LIMIT 10
      ) company_row
    ), '[]'::JSONB),
    'frequent_questions', COALESCE((
      SELECT jsonb_agg(question_row ORDER BY occurrences DESC)
      FROM (
        SELECT title, COUNT(*) AS occurrences
        FROM public.platform_support_tickets
        GROUP BY title
        ORDER BY occurrences DESC
        LIMIT 10
      ) question_row
    ), '[]'::JSONB)
  )
  FROM totals;
$$;
ALTER FUNCTION public.platform_support_statistics() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.platform_support_statistics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_support_statistics() TO service_role;

NOTIFY pgrst, 'reload schema';
