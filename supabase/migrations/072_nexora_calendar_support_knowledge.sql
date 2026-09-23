-- Keep the official support assistant aligned with the native Nexora calendar.

UPDATE public.platform_support_documents
SET
  title = 'Escalamiento y Calendario Nexora',
  content = 'Nexora Asistente debe escalar cuando el usuario solicita una persona o reunión, no existe documentación suficiente, la solución ya se intentó sin resultado, una herramienta falla, o el asunto involucra facturación, seguridad o pérdida de datos. El caso debe incluir un resumen, ruta, pasos intentados y errores redactados. Las sesiones de soporte se confirman y guardan directamente en el Calendario Nexora, que es la fuente oficial. Google Calendar es una sincronización opcional para crear eventos, invitaciones y enlaces de Google Meet; si no está conectado o falla, la reserva de Nexora sigue siendo válida.',
  status = 'published',
  published_at = COALESCE(published_at, NOW()),
  updated_at = NOW()
WHERE id = '10000000-0000-4000-8000-000000000009';

UPDATE public.platform_support_chunks chunk
SET content = document.content
FROM public.platform_support_documents document
WHERE chunk.document_id = document.id
  AND chunk.document_id = '10000000-0000-4000-8000-000000000009'
  AND chunk.chunk_index = 0;

NOTIFY pgrst, 'reload schema';
