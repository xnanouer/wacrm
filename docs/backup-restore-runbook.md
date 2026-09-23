# Runbook de respaldo y recuperación

## Alcance

Respaldar por separado la base de datos Supabase, los buckets privados y los
volúmenes del worker QR. Un respaldo se considera válido solo después de una
restauración de prueba.

## Frecuencia recomendada

- Base de datos: respaldo diario y recuperación a un punto en el tiempo si el
  plan de Supabase lo permite.
- Storage privado: copia diaria de objetos y metadatos.
- Volumen de sesiones QR: diario y antes de actualizar el worker.
- Retención: 30 copias diarias y 12 mensuales, ajustada a la política legal.

## Restauración de prueba

1. Cree un proyecto Supabase aislado de staging.
2. Restaure la base de datos y luego los objetos de Storage conservando bucket
   y ruta exactos.
3. Aplique solo migraciones posteriores al punto restaurado.
4. Inicie Nexora con credenciales de staging y compruebe autenticación,
   aislamiento entre dos empresas, apertura de multimedia, contratos y envío
   de un mensaje de prueba.
5. Restaure el volumen QR solo en un worker detenido y verifique una sesión.
6. Registre fecha, duración, RPO/RTO obtenido y hallazgos.

## Incidente real

Detenga escrituras si existe corrupción, preserve evidencia y rote secretos
si hubo acceso no autorizado. Nunca restaure producción encima de datos vivos
sin una instantánea previa y una aprobación explícita del responsable.
