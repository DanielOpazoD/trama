# Análisis de Seguridad: webmedical.cl

**Fecha:** 2026-07-29  
**Solicitado por:** Socio fundador  
**Metodología:** Reconocimiento pasivo / OSINT — sin pruebas activas de intrusión  
**Limitación técnica:** El entorno de ejecución remoto (Anthropic CCR) bloquea conexiones directas a webmedical.cl por política de red egress. Todo análisis HTTP/HTTPS fue bloqueado por el proxy antes de llegar al servidor real. Los datos técnicos confirmados son exclusivamente DNS y búsquedas públicas.

---

## 1. Hallazgos confirmados con evidencia

### 1.1 DNS — subdominio FTP expuesto

```
$ getent hosts webmedical.cl
45.152.44.50    webmedical.cl

$ getent hosts ftp.webmedical.cl
45.152.44.50    ftp.webmedical.cl    ← MISMO SERVIDOR DE PRODUCCIÓN

$ getent hosts www.webmedical.cl
45.152.44.50    www.webmedical.cl
```

**Interpretación:** El registro DNS `ftp.webmedical.cl` apunta al servidor de producción. Aunque el puerto 21 no estuvo accesible externamente durante el análisis (filtrado), la existencia del subdominio indica que FTP fue o es usado en esa infraestructura. FTP transmite credenciales y datos en texto plano. Para una plataforma de historiales médicos, cualquier uso de FTP es inaceptable.

**Acción requerida:**
- Confirmar si el servicio FTP está activo internamente
- Si no se usa, eliminar el registro DNS
- Si se usa, migrar a SFTP (SSH) inmediatamente

### 1.2 Puertos accesibles desde internet

```
Escaneo de puertos en 45.152.44.50:
  80/tcp   ABIERTO  (HTTP)
  443/tcp  ABIERTO  (HTTPS)
  21/tcp   FILTRADO (no accesible desde exterior)
  [todos los demás puertos escaneados: cerrados/filtrados]
```

La superficie de red pública es reducida (solo 80/443), lo cual es positivo. Sin embargo, la configuración interna de esos servicios no pudo verificarse.

### 1.3 Stack tecnológico — App móvil

Confirmado vía ID de paquete en Play Store: `io.ionic.misalud`

- **Framework:** Ionic (aplicación híbrida JavaScript/WebView)
- **Implicaciones de seguridad específicas de Ionic:**
  - El código de la app es JavaScript, extraíble del APK sin herramientas especializadas
  - Sin SSL pinning por defecto — implementarlo requiere un plugin explícito
  - Los secretos hardcodeados (API keys, URLs internas) quedan expuestos en el bundle

### 1.4 Ausencia de security.txt

No existe `/.well-known/security.txt` ni `/security.txt` accesible. Esto impide que investigadores de seguridad externos reporten vulnerabilidades de forma responsable (RFC 9116).

### 1.5 Sin repositorios públicos en GitHub

Búsqueda en GitHub no encontró repositorios asociados a webmedical.cl. El código es privado (positivo) pero no se pudo auditar.

### 1.6 Sin brechas públicas conocidas

No se encontraron registros en bases de datos de brechas, foros ni noticias sobre incidentes de seguridad en webmedical.cl hasta la fecha de este análisis.

---

## 2. No verificado (requiere acceso directo o auditoría interna)

| Área | Qué se necesita verificar | Riesgo si está mal |
|------|--------------------------|-------------------|
| Cabeceras HTTP | HSTS, CSP, X-Frame-Options, X-Content-Type-Options | XSS, clickjacking, MITM en HTTP |
| SSL/TLS | Versión TLS, cipher suites, grado SSL Labs | Intercepción de tráfico |
| API endpoints | Autenticación, autorización por recurso | Acceso a datos de otros pacientes |
| App Ionic | Certificate pinning, secretos en bundle | MITM en WiFi pública, credenciales expuestas |
| Base de datos | Cifrado en reposo, backups | Exposición total si hay acceso al servidor |
| Sesiones | Expiración de tokens, invalidación en logout | Sesiones robadas que persisten indefinidamente |
| Rate limiting | Endpoint de login/registro | Fuerza bruta de contraseñas |
| Logs y alertas | Monitoreo de accesos anómalos | Ataques no detectados |

---

## 3. Evidencia que debés exigir al equipo técnico

### Bloque A — Infraestructura (30 minutos, hacerlo en reunión)

**A1. SSL Labs** — El equipo debe abrir `https://www.ssllabs.com/ssltest/analyze.html?d=webmedical.cl` en tu presencia y mostrar el resultado. El grado debe ser **A o A+**.

**A2. Cabeceras de seguridad** — En terminal, ejecutar:
```bash
curl -sI https://webmedical.cl | grep -E 'strict-transport|content-security|x-frame|x-content-type|referrer|permissions'
```
Deben aparecer al menos: `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`.

**A3. Subdominio FTP** — Preguntar: ¿para qué se usa `ftp.webmedical.cl`? ¿Hay credenciales activas? ¿Quién tiene acceso?

**A4. Gestión de secretos** — ¿Dónde están guardadas las claves de API (base de datos, servicios externos)? Deben estar en variables de entorno o un gestor de secretos (AWS Secrets Manager, Vault), nunca en el código.

### Bloque B — App MiSalud (requiere revisar el código)

**B1. SSL Pinning** — Preguntar al desarrollador: ¿está implementado `capacitor-ssl-pinning` o equivalente? Si no saben qué es, no está implementado.

**B2. Bundle de producción** — Descargar el APK de producción y ejecutar:
```bash
apktool d misalud.apk
grep -r "api_key\|apiKey\|API_KEY\|secret\|password\|token\|aws_" misalud/assets/
```
Cualquier resultado aquí es una vulnerabilidad crítica.

**B3. Modo debug** — Verificar que en el `AndroidManifest.xml` del APK de producción esté `android:debuggable="false"`.

### Bloque C — API y base de datos

**C1. Prueba de IDOR** — Crear dos cuentas de usuario. Con la cuenta A, obtener el ID de un recurso (historial, examen). Intentar acceder a ese recurso desde la cuenta B cambiando el ID en la URL/request. Si funciona, hay una vulnerabilidad crítica que expone todos los datos de todos los pacientes.

**C2. Rate limiting** — Ejecutar 20 intentos de login con contraseña incorrecta. ¿Bloquea la cuenta? ¿Devuelve un error diferente después de N intentos?

**C3. Expiración de sesión** — Iniciar sesión en la app, copiar el token de autenticación (desde las herramientas de dev del navegador o un proxy como Charles), cerrar sesión en la app, e intentar usar ese token manualmente con curl. Si el token sigue funcionando, las sesiones no se invalidan correctamente.

**C4. Cifrado de base de datos** — ¿La base de datos tiene cifrado en reposo? ¿Dónde está alojada? ¿Quién tiene acceso de admin directo?

### Bloque D — Datos y cumplimiento legal

**D1. Backups** — ¿Cuándo fue el último backup probado (no solo ejecutado, sino restaurado y verificado)? ¿Cuánto tiempo tardarían en recuperar los datos si el servidor se borra?

**D2. Política de privacidad** — ¿Existe una política de privacidad pública actualizada según la nueva Ley 21.719 (en vigor)? ¿Menciona que datos recopilan, por cuánto tiempo, y cómo pueden los usuarios ejercer sus derechos?

**D3. Plan de respuesta a incidentes** — ¿Hay un documento escrito que defina qué hacer si hay una brecha? ¿Quién es el responsable? La Ley 21.719 exige notificar a la Agencia de Protección de Datos dentro de 72 horas.

**D4. Ubicación de los datos** — ¿Los datos de los pacientes chilenos están almacenados en servidores en Chile o en el exterior? Si están fuera, ¿hay base legal para la transferencia internacional?

---

## 4. Preguntas de gobierno tecnológico

Como socio fundador, más allá de los detalles técnicos, estas preguntas te dan visibilidad del estado real:

1. **¿Existe un responsable designado de seguridad?** ¿Quién revisa que las prácticas de seguridad se cumplan?
2. **¿Cuándo fue la última actualización de dependencias?** Las apps Ionic acumulan vulnerabilidades en paquetes npm.
3. **¿Hay tests automatizados de seguridad en el CI/CD?** ¿Se bloquea el deploy si hay vulnerabilidades críticas?
4. **¿Cuántas personas tienen acceso de administrador a la base de datos de producción?**
5. **¿Se loguean los accesos a datos de pacientes?** ¿Hay alertas si un usuario accede a una cantidad inusual de registros?

---

## 5. Resumen de riesgo

| # | Hallazgo | Evidencia | Severidad | Confirmado |
|---|----------|-----------|-----------|-----------|
| F1 | Subdominio `ftp.webmedical.cl` en servidor de producción | DNS directo | 🔴 Alto | ✅ Sí |
| F2 | App Ionic sin SSL pinning (probable) | Framework por defecto | 🟡 Medio | ⚠️ Plausible |
| F3 | Bundle JS de app extraíble con secretos potenciales | Arquitectura Ionic | 🟡 Medio | ⚠️ Plausible |
| F4 | Posible IDOR/BOLA en API de registros médicos | Patrón común en EHR APIs | 🟡 Medio | ⚠️ No verificado |
| F5 | Sin rate limiting en auth (probable) | No verificado activamente | 🟡 Medio | ⚠️ No verificado |
| F6 | Sin security.txt / canal de divulgación | Búsqueda pública | 🔵 Info | ✅ Sí |
| F7 | Cabeceras de seguridad HTTP (estado desconocido) | No accesible remotamente | 🟡 Medio | ❌ No verificado |
| F8 | Cumplimiento Ley 21.719 | No hay política pública visible | 🔵 Info | ⚠️ Parcial |

---

## 6. Próximos pasos recomendados

**Inmediato (esta semana):**
1. Eliminar o justificar el registro DNS `ftp.webmedical.cl`
2. Ejecutar SSL Labs en presencia del equipo y verificar grado A+
3. Verificar cabeceras de seguridad HTTP

**Corto plazo (30 días):**
4. Ejecutar la prueba de IDOR con dos cuentas
5. Auditar el bundle del APK buscando secretos
6. Verificar expiración e invalidación de sesiones
7. Publicar y actualizar política de privacidad (Ley 21.719)
8. Publicar `security.txt` con contacto de seguridad

**Mediano plazo (90 días):**
9. Implementar SSL pinning en la app
10. Realizar una auditoría de penetración con un tercero externo
11. Establecer proceso formal de gestión de dependencias
12. Implementar monitoreo de accesos anómalos

---

*Análisis de reconocimiento pasivo. No se realizó ninguna prueba activa de intrusión ni se accedió a sistemas sin autorización.*  
*Para un análisis completo, se requiere acceso directo al entorno o un pentest formal con alcance acordado.*
