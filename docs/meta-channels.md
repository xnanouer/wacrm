# Facebook Messenger e Instagram

WACRM usa una sola app central de Meta, pero guarda las autorizaciones por
empresa. Un administrador de cada empresa elige sus propias páginas durante el
OAuth; sus tokens cifrados y conversaciones nunca se comparten con otra cuenta.

La integración no se activa al desplegar el código. Requiere completar esta
configuración y después pulsar **Ajustes → Facebook & Instagram → Conectar**
en el canal correspondiente de cada empresa.

## 1. Base de datos y variables

Aplica las migraciones `034_omnichannel_foundation.sql` y
`035_meta_messaging.sql`, seguidas de
`036_unique_active_social_connection.sql`. Configura estas variables en el
servidor:

```env
NEXT_PUBLIC_SITE_URL=https://crm.tudominio.com
META_APP_ID=...
META_APP_SECRET=...
META_WEBHOOK_VERIFY_TOKEN=un-valor-largo-y-aleatorio
ENCRYPTION_KEY=64-caracteres-hexadecimales
```

Opcionalmente se pueden definir `META_GRAPH_API_VERSION` y
`META_LOGIN_CONFIG_ID`. El valor por defecto actual es `v24.0`.

`NEXT_PUBLIC_SITE_URL` debe ser HTTPS y coincidir exactamente con el dominio
público. Meta no puede llamar a un webhook en `localhost`.

## 2. App de Meta

En Meta for Developers crea una app de tipo Business y agrega los productos o
casos de uso de Messenger, Instagram y Facebook Login for Business.

Configura como redirect OAuth válido la dirección que muestra WACRM:

```text
https://crm.tudominio.com/api/meta/oauth/callback
```

Solicita estos permisos en el inicio de sesión:

- `business_management`
- `pages_show_list`
- `pages_messaging`
- `pages_manage_metadata`
- `pages_read_engagement`
- `instagram_basic`
- `instagram_manage_messages`

Para conectar empresas que no tienen un rol dentro de tu app, Meta exige poner
la app en modo Live y aprobar los permisos avanzados correspondientes. También
puede exigir verificación del negocio y revisión de la app.

La empresa nunca escribe estas credenciales en Nexora. Inicia sesión en Meta,
elige Facebook o Instagram y autoriza únicamente las cuentas que administra.
Nexora guarda el token resultante cifrado y asociado al `account_id` de esa
empresa.

## 3. Webhooks

En el panel de Meta registra la URL que muestra WACRM:

```text
https://crm.tudominio.com/api/meta/webhook
```

Usa exactamente `META_WEBHOOK_VERIFY_TOKEN` como token de verificación.
Suscribe el objeto **Page** a `messages`, `message_deliveries` y
`message_reads`, y el objeto
**Instagram** a `messages`, `messaging_postbacks`, `messaging_seen` y
`message_reactions`.

WACRM valida `X-Hub-Signature-256` con `META_APP_SECRET` antes de procesar un
evento. Además, al autorizar una empresa, suscribe por API cada página; la
cuenta profesional de Instagram vinculada usa esa autorización de Facebook
Login for Business.

## 4. Requisitos de las cuentas

- Facebook: el usuario que autoriza debe administrar la página y tener tarea de
  mensajería.
- Si la página pertenece a un portafolio comercial de Meta, la configuración de
  Facebook Login for Business debe incluir `business_management`; de lo
  contrario, `/me/accounts` puede devolver una lista vacía.
- Instagram: debe ser una cuenta Business o Creator vinculada a una página de
  Facebook autorizada.
- La persona debe iniciar primero la conversación. Meta limita las respuestas
  normales a la ventana de mensajería permitida por la plataforma.

## 5. Comportamiento en WACRM

- Los mensajes entrantes crean o reabren un ticket en el inbox.
- El contacto queda identificado mediante su ID externo por canal y conexión.
- Cada conversación muestra una insignia de WhatsApp, Facebook o Instagram.
- Los agentes y el agente IA responden texto por Facebook e Instagram.
- El catálogo puede enviar las fichas comerciales y fotos reales por los tres
  canales. Las imágenes privadas usan URLs firmadas y temporales para que Meta
  pueda descargarlas sin publicar el bucket.
- Messenger muestra enviado, entregado y visto. Instagram muestra enviado y
  visto según los eventos que entrega Meta; un mensaje visto también queda
  implícitamente entregado.
- Desconectar elimina el token cifrado, conserva el historial y bloquea nuevos
  envíos desde esa conexión.
- Una página o cuenta profesional solo puede estar activa en una empresa a la
  vez; esto evita que un webhook se enrute al tenant equivocado.
- Facebook e Instagram consumen un canal cada uno y respetan el límite del plan
  contratado, igual que las conexiones de WhatsApp.

## 6. Prueba recomendada

1. Pulsa **Conectar** en Facebook y autoriza una página de prueba.
2. Envía un mensaje a la página desde una cuenta personal externa.
3. Comprueba que aparece en el inbox con la insignia correcta.
4. Responde desde WACRM y verifica la recepción en Facebook o Instagram.
5. Repite desde **Conectar Instagram** con una cuenta Business o Creator.
6. Repite con una segunda empresa y confirma que solo ve sus propias cuentas.
