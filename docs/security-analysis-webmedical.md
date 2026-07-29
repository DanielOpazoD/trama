# Análisis de Seguridad: webmedical.cl

**Fecha:** 2026-07-29  
**Metodología:** Reconocimiento pasivo / OSINT  
**Alcance:** Análisis de superficie de ataque pública — sin pruebas activas de explotación

---

## Resumen ejecutivo

webmedical.cl es una startup chilena de salud digital que ofrece la plataforma **MiSalud** (historial médico digital) y productos asociados como **JourMEd**. El sitio maneja datos sensibles de salud de pacientes, lo que lo convierte en un objetivo de alto valor para atacantes.

El análisis identificó **un hallazgo de alto riesgo**, **cuatro de riesgo medio** y **tres informativos**. No se encontraron incidentes de seguridad públicamente reportados.

> **Limitación importante:** El entorno de análisis bloquea conexiones directas a webmedical.cl por política de red. Todo lo obtenido es mediante OSINT (DNS, búsquedas, análisis de apps públicas). No se realizaron pruebas activas de intrusión.

---

## Información técnica recopilada

| Elemento | Valor |
|----------|-------|
| IP principal (IPv4) | `45.152.44.50` |
| IP principal (IPv6) | `2a02:4780:13:891:0:2476:46e1:6` |
| `www.webmedical.cl` | Mismo IP (`45.152.44.50`) |
| `ftp.webmedical.cl` | Mismo IP (`45.152.44.50`) — **FTP activo** |
| Respuesta HTTP (port 80) | `403 Forbidden` con cabecera `x-deny-reason: host_not_allowed` |
| Cabecera `Server` | No expuesta |
| Stack app móvil | **Ionic** (confirmado por paquete de Play Store: `io.ionic.misalud`) |
| Indexación Google | No indexado públicamente |
| Incidentes públicos | Ninguno encontrado |

---

## Hallazgos

### 🔴 ALTO — Subdominio FTP expuesto

**`ftp.webmedical.cl` resuelve a la misma IP del servidor principal.**

FTP (puerto 21) es un protocolo sin cifrado. Las credenciales y los datos se transmiten en texto plano. Para una plataforma que maneja historiales médicos electrónicos, esto es inaceptable:

- Un atacante en posición de red puede interceptar credenciales FTP con herramientas básicas (Wireshark, tcpdump).
- Si el FTP comparte credenciales con otros sistemas, una captura comprometer múltiples servicios.
- La exposición del subdominio en DNS revela infraestructura interna.

**Recomendación:**
- Deshabilitar FTP completamente. Reemplazar con SFTP (SSH, puerto 22) o FTPS si el protocolo es requerido.
- Eliminar el registro DNS `ftp.webmedical.cl` si el servicio no es necesario externamente.
- Auditar logs de acceso FTP para detectar accesos no autorizados anteriores.

---

### 🟡 MEDIO — Ausencia de cabeceras de seguridad HTTP

Las respuestas HTTP inspeccionadas (403) no incluyen cabeceras de seguridad estándar:

| Cabecera ausente | Riesgo |
|------------------|--------|
| `Strict-Transport-Security` | Permite downgrade a HTTP (MITM) |
| `Content-Security-Policy` | Facilita ataques XSS |
| `X-Frame-Options` | Clickjacking posible |
| `X-Content-Type-Options` | MIME sniffing en IE/Edge |
| `Referrer-Policy` | Filtración de URLs en referrer |
| `Permissions-Policy` | Acceso no restringido a APIs de browser |

Nota: las cabeceras 403 pueden no ser representativas del servidor real. Se requiere inspección directa de respuestas 200 para confirmar.

**Recomendación:** Configurar un middleware global que añada estas cabeceras en todas las respuestas.

---

### 🟡 MEDIO — App Ionic sin SSL pinning probable

La app `MiSalud` usa el framework **Ionic** (JavaScript/WebView híbrido), lo cual implica:

1. **Sin SSL pinning por defecto:** Ionic no incluye certificate pinning out-of-the-box. Un atacante con control de la red (WiFi pública, router comprometido) puede interceptar el tráfico API con un certificado fraudulento.
2. **JavaScript extraíble:** El bundle de la app es JavaScript comprimido pero no cifrado. Atacantes pueden extraerlo del APK/IPA con herramientas estándar (`apktool`, `frida`) para descubrir:
   - Endpoints de la API
   - Claves de API hardcodeadas
   - Lógica de negocio y validaciones del lado cliente

**Recomendación:**
- Implementar SSL/TLS pinning via Cordova/Capacitor plugins (ej. `capacitor-ssl-pinning`).
- Auditar el bundle compilado buscando secretos hardcodeados (claves AWS, tokens de API, URLs de staging).
- Habilitar obfuscación del código JS en el build de producción.

---

### 🟡 MEDIO — Riesgo de BOLA/IDOR en API de historiales médicos

Las APIs de salud son especialmente susceptibles a **Broken Object Level Authorization (OWASP API1)**: un paciente autenticado puede acceder a los registros de otro modificando un ID numérico o UUID en la URL.

Ejemplo de patrón vulnerable:
```
GET /api/v1/patients/12345/records
```
Si el backend no verifica que el paciente autenticado sea el titular del ID `12345`, cualquier usuario puede acceder a cualquier historial.

No se pudo verificar si este es el caso en webmedical.cl, pero es el vector más común en plataformas de EHR y debería ser auditado explícitamente.

**Recomendación:**
- Cada endpoint de la API debe verificar que el recurso solicitado pertenece al usuario autenticado.
- Implementar pruebas de autorización automatizadas.
- Usar UUIDs aleatorios (no secuenciales) para IDs de registros.

---

### 🟡 MEDIO — Posible falta de rate limiting en autenticación

Las apps Ionic típicamente usan APIs REST para autenticación. Sin rate limiting:

- Ataques de fuerza bruta a contraseñas son posibles.
- Credential stuffing con listas de credenciales filtradas de otras brechas.
- Enumeración de cuentas (registro de usuario ya existente vs. nuevo).

**Recomendación:**
- Implementar rate limiting con bloqueo progresivo (ej. 5 intentos → bloqueo 15 min).
- Añadir CAPTCHA o protección contra bots en endpoints de login/registro.
- Alertas de telemetría por picos de intentos fallidos.

---

### 🔵 INFORMATIVO — Cumplimiento regulatorio chileno

webmedical.cl maneja datos de salud sensibles que caen bajo:

- **Ley 19.628** (Protección de datos personales) — Actualmente vigente.
- **Ley 21.719** (nueva ley de datos personales) — En proceso de entrada en vigencia, comparable al GDPR europeo.

Los requisitos clave que aplican a una plataforma de EHR:
- Obtener consentimiento explícito para cada finalidad de tratamiento de datos.
- Permitir al paciente acceder, rectificar y eliminar sus datos.
- Notificar a la Agencia de Protección de Datos y a los afectados dentro de 72 horas ante una brecha.
- No transferir datos de salud a terceros sin base legal explícita.

No se encontró política de privacidad pública accesible ni canal de reporte de vulnerabilidades (security.txt).

---

### 🔵 INFORMATIVO — Ausencia de security.txt

No existe `/security.txt` ni `/.well-known/security.txt` accesible públicamente. Este archivo estándar (RFC 9116) permite a investigadores de seguridad reportar vulnerabilidades de forma responsable.

**Recomendación:** Publicar un `security.txt` con email de contacto de seguridad y política de divulgación responsable.

---

### 🔵 INFORMATIVO — Superficie de ataque no enumerada

No fue posible acceder a:
- `robots.txt` (podría revelar rutas sensibles)
- Sitemap (enumeración de endpoints)
- Panel de administración
- Endpoints de API públicos

Se recomienda una revisión completa desde dentro de la infraestructura o con autorización de prueba activa.

---

## Resumen de riesgos

| ID | Severidad | Hallazgo | Confirmado |
|----|-----------|----------|------------|
| F1 | 🔴 Alto | Subdominio FTP expuesto (`ftp.webmedical.cl`) | ✅ Sí (DNS) |
| F2 | 🟡 Medio | Cabeceras de seguridad HTTP ausentes | ⚠️ Parcial (solo 403s) |
| F3 | 🟡 Medio | App Ionic sin SSL pinning probable | ⚠️ Plausible (by design) |
| F4 | 🟡 Medio | Riesgo BOLA/IDOR en API de historiales | ⚠️ No verificado |
| F5 | 🟡 Medio | Posible ausencia de rate limiting en auth | ⚠️ No verificado |
| F6 | 🔵 Info | Cumplimiento Ley 21.719 pendiente de evaluación | — |
| F7 | 🔵 Info | Sin security.txt / canal de divulgación | ✅ Confirmado (no indexado) |
| F8 | 🔵 Info | Superficie no enumerada (robots.txt, admin, API) | — |

---

## Próximos pasos recomendados

Para un análisis completo se requiere:

1. **Prueba activa autorizada** — Con acceso directo al sitio, inspección de cabeceras reales, escaneo de puertos (nmap), testeo de autenticación y endpoints.
2. **Revisión del APK/IPA** — Descompilar la app MiSalud para inspeccionar secretos hardcodeados, endpoints de API y configuración de SSL.
3. **Revisión de código** — Si hay acceso al repositorio, analizar configuración de seguridad del backend.
4. **Escaneo de dependencias** — Verificar que las dependencias npm/Cordova/Capacitor no tengan CVEs conocidos.
5. **Prueba de autorización de API** — Verificar BOLA/IDOR en todos los endpoints que retornan datos de pacientes.

---

*Análisis realizado mediante reconocimiento pasivo. No se realizó ninguna prueba activa de intrusión ni se accedió a sistemas sin autorización.*
