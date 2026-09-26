# Despliegue de producción de Nexora

## Servicios obligatorios

Nexora debe ejecutar dos procesos permanentes: la aplicación Next.js y el
worker de WhatsApp QR. El archivo `docker-compose.production.example.yml`
los separa, reinicia ante fallos y conserva la sesión QR en un volumen.

No publique el puerto 3001. Solo la aplicación debe comunicarse con el worker
por la red privada usando `WHATSAPP_WEB_BRIDGE_SECRET`.

## Variables secretas

Configure como secretos del servidor, nunca en el repositorio:

- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY` (64 caracteres hexadecimales)
- `WHATSAPP_WEB_BRIDGE_SECRET` (distinto de `ENCRYPTION_KEY`)
- `AUTOMATION_CRON_SECRET`
- `CRON_SECRET` (obligatorio cuando los cron se ejecutan en Vercel)
- credenciales de Meta, Mercado Pago y Google que use la instalación

Las variables `NEXT_PUBLIC_*` se incorporan también durante el build. Use el
dominio HTTPS real en `NEXT_PUBLIC_SITE_URL` y en las URLs permitidas de
Supabase Auth.

## Despliegue

1. Revise y aplique las migraciones pendientes en staging, incluidas
   `084_private_operational_media.sql` y
   `085_platform_storage_monitor.sql`.
2. Construya la imagen sin copiar archivos `.env`.
3. Inicie los dos servicios y verifique `GET /api/health`.
4. Coloque un proxy HTTPS delante del puerto 3000.
5. Configure alertas por reinicios, uso de disco, respuestas 5xx y fallo del
   healthcheck.

## Tareas programadas

Un scheduler externo debe llamar con el encabezado
`x-cron-secret: <AUTOMATION_CRON_SECRET>`:

- cada minuto: `/api/automations/cron`
- cada cinco minutos: `/api/flows/cron`
- una vez al día: `/api/quotes/retention`
- una vez al día: `/api/platform/storage/monitor`

Los endpoints responden 503 si el secreto no está configurado. Registre y
alerte cualquier respuesta distinta de 2xx.

En Vercel, configure `CRON_SECRET`; la plataforma lo envía como
`Authorization: Bearer <CRON_SECRET>`. `vercel.json` registra los cuatro
trabajos. En instalaciones propias se mantiene la compatibilidad con
`x-cron-secret` y `AUTOMATION_CRON_SECRET`.

Antes de desplegar, cargue las variables del entorno de producción y ejecute
`npm run deploy:check`. En instalaciones locales el comando carga `.env`
automáticamente sin sobrescribir variables ya definidas. El comando no imprime
secretos y falla si detecta
variables obligatorias ausentes, valores de ejemplo, secretos demasiado
cortos, migración final ausente o cron incompletos.

## WhatsApp QR

El volumen `whatsapp_sessions` debe permanecer cifrado en reposo, respaldado y
accesible solo por el usuario del contenedor. Reiniciar el contenedor conserva
la sesión; borrar el volumen obliga a escanear el QR otra vez. Para alta
disponibilidad no ejecute dos workers sobre la misma sesión simultáneamente.

## Despliegue exclusivo con WhatsApp Cloud API

Cuando todas las conexiones usan la API oficial de Meta no se necesita el
worker QR. Use `docker-compose.cloud-api.yml`; este perfil ejecuta una sola
instancia de Next.js, Caddy como proxy HTTPS y un scheduler interno para los
cuatro endpoints programados. El puerto 3000 permanece dentro de la red de
Docker y solo Caddy publica 80/443.

Guarde los secretos en `.env.production`, que queda excluido del contexto de
Docker. Ejecute Compose indicando ese archivo para que las variables
`NEXT_PUBLIC_*` estén disponibles también durante el build:

```bash
docker compose --env-file .env.production \
  -f docker-compose.cloud-api.yml up -d --build
```

Este perfil conserva el volumen TLS de Caddy, pero no crea volúmenes de sesión
QR. Si una empresa necesita conexión mediante QR, use el despliegue completo y
respalde `whatsapp_sessions` como se describe arriba.

## Despliegue híbrido en VPS

Para operar simultáneamente con Meta Cloud API y conexiones por QR use
`docker-compose.production.yml`. Este perfil mantiene cuatro servicios:

- `web`: la aplicación Next.js;
- `whatsapp-worker`: el navegador aislado que conserva las sesiones QR;
- `scheduler`: los trabajos programados internos;
- `caddy`: HTTPS y proxy público.

El worker escucha en el puerto 3001 solo dentro de la red privada de Docker. No
publique ese puerto en el firewall ni en el host. Las sesiones y la caché del
dispositivo vinculado viven en los volúmenes `whatsapp_sessions` y
`whatsapp_cache`; inclúyalos en los respaldos del VPS.

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml up -d --build
```

En un KVM1 los límites de memoria del archivo Compose dejan capacidad para el
sistema operativo y usan el swap solo para picos breves de Chromium. Supervise
memoria, reinicios y el healthcheck del worker antes de aumentar el número de
sesiones QR concurrentes.
