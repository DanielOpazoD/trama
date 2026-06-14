# WhatsApp — captura por mensaje (vía Twilio)

Permite agregar **notas, citas, entidades y momentos** a Trama mandando un
mensaje de WhatsApp. Pensado para captura rápida desde el bolsillo; la
curaduría fina (vincular entidades, ediciones) se hace después en la app.

## Arquitectura

```
WhatsApp ──> Twilio ──POST /api/whatsapp-webhook──> Trama
                         (firma X-Twilio-Signature)
```

- **`netlify/functions/whatsapp-webhook.mts`** — endpoint público. Verifica la
  firma de Twilio, resuelve el número → usuario (`whatsapp_links`), interpreta
  el mensaje y escribe. Responde con **TwiML** (XML) que Twilio entrega como
  respuesta — no hace falta llamada saliente ni credenciales de envío.
- **`netlify/functions/whatsapp-link.mts`** — endpoint autenticado (sesión
  real). Genera/lista/borra vínculos. UI en Configuración → WhatsApp.
- **`_lib/whatsapp/`** — piezas puras y testeadas:
  - `twilio-signature.ts` — HMAC-SHA1 del algoritmo de Twilio.
  - `phone.ts` — normaliza `whatsapp:+56…` → E164.
  - `link-code.ts` — código de un solo uso (alfabeto sin ambigüedades).
  - `parse-command.ts` — parser híbrido: prefijos (`nota:`, `cita:`,
    `entidad:`, `momento:`) y comandos (`vincular`, `ayuda`).
  - `interpret.ts` — prompt + validador del clasificador IA (texto libre).
  - `persist.ts` — escribe en cada dominio reusando tags/embeddings.
  - `twiml.ts` — respuesta XML.
- **Tabla `whatsapp_links`** (migración `20260613230000_whatsapp_links`):
  mapea `phone_e164 → user_id`, con códigos pendientes y soft-delete. RLS por
  usuario; el webhook la lee con bypass de sistema (igual que un PAT).

## Vinculación (prueba de propiedad del número)

1. En la app: Configuración → WhatsApp → **generar código**. Crea una fila
   pendiente con un código que vence en 15 min.
2. El usuario manda `vincular <CÓDIGO>` por WhatsApp.
3. El webhook canjea el código (CTE atómico): ata el número, marca
   `verified_at`, limpia el código. A partir de ahí ese número escribe como
   ese usuario.

Sin vínculo verificado, el webhook responde con instrucciones y **no escribe
nada**.

## Interpretación híbrida

- **Con prefijo** → instantáneo, sin costo de LLM:
  - `nota: <texto>` → Nota.
  - `cita: <frase> — <autor>` → Cita (busca/crea la entidad del autor).
  - `entidad: <nombre> (tipo)` → Entidad (tipo default `concepto`).
  - `momento: <qué pasó>` → Momento (`kind=nota`, fechado hoy).
- **Sin prefijo (texto libre)** → un LLM clasifica en una de las cuatro y
  extrae los campos (`classify`, mismo cost-cap mensual que `extract`). Ante
  la duda cae a **nota**. Si el presupuesto está agotado o la IA está en modo
  Off, también cae a nota — la captura nunca se bloquea.

Una cita necesita autor (la entidad a la que cuelga). Si no viene, el webhook
pide reenviarla con `cita: <texto> — <autor>`.

## Seguridad

- **Firma obligatoria en producción.** Si `TWILIO_AUTH_TOKEN` está seteado, un
  webhook sin `X-Twilio-Signature` válida devuelve 401. Sin el token (dev
  local) la verificación se omite.
- El webhook resuelve el usuario por número; solo números **verificados**
  escriben, y siempre bajo el RLS del dueño.

## Variables de entorno

| Var                    | Para qué                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TWILIO_AUTH_TOKEN`    | Verificar la firma de los webhooks entrantes (consola Twilio).                                                                                    |
| `TWILIO_WEBHOOK_URL`   | Opcional. URL exacta configurada en Twilio si difiere del proxy.                                                                                  |
| `VITE_WHATSAPP_NUMBER` | Número del bot (E164). Habilita el QR + botón "Abrir WhatsApp". Público (va al cliente). Sin él, el panel cae a copiar/pegar `vincular <código>`. |

## Onboarding de un toque (QR + deep link)

Si `VITE_WHATSAPP_NUMBER` está configurado, el panel Configuración → WhatsApp
genera, junto al código, un **QR** y un botón **"Abrir WhatsApp"** que apuntan
a `https://wa.me/<número>?text=vincular%20<código>`. El usuario escanea (desde
otro celular) o toca el botón (si ya está en el teléfono) → WhatsApp abre con
el mensaje `vincular <código>` ya escrito → solo aprieta enviar. Cero copiar y
pegar. El helper puro vive en `src/lib/whatsappLink.ts` (testeado); el QR usa
`qrcode` con import perezoso, igual que `MomentoQRModal`.

## Setup externo (lo que hace el usuario)

Ver la sección "paso a paso" en la conversación de implementación, resumida:

1. Crear cuenta en [twilio.com](https://www.twilio.com) y activar el **WhatsApp
   Sandbox** (Messaging → Try it out → WhatsApp), o un número de WhatsApp
   Business aprobado.
2. Unirse al sandbox enviando el código `join <palabras>` al número de Twilio
   desde tu WhatsApp.
3. En Twilio, configurar **"When a message comes in"** →
   `https://<tu-dominio>/api/whatsapp-webhook` (POST).
4. Copiar el **Auth Token** de Twilio y setear `TWILIO_AUTH_TOKEN` en las env
   vars de Netlify. Redeploy.
5. En Trama: Configuración → WhatsApp → generar código → mandar
   `vincular <código>` por WhatsApp.
6. Listo: `nota: …`, `cita: … — autor`, `entidad: …`, `momento: …` o texto
   libre.

> El sandbox de Twilio caduca la sesión cada 24-72 h (hay que reenviar el
> `join`). Para uso permanente, registrar un número de WhatsApp Business.
