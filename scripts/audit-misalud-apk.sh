#!/usr/bin/env bash
# =============================================================================
# audit-misalud-apk.sh
# Auditoría de seguridad del APK de MiSalud (io.ionic.misalud)
#
# Uso: bash audit-misalud-apk.sh [ruta/al/misalud.apk]
#      Sin argumento: descarga el APK automáticamente via ADB o APKPure
#
# Requisitos: java, python3, curl
# Opcional: adb (para extraer desde dispositivo Android)
# =============================================================================

set -euo pipefail

PKG="io.ionic.misalud"
WORKDIR="$(mktemp -d)/misalud-audit"
mkdir -p "$WORKDIR"

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${BLUE}[*]${NC} $*"; }
ok()     { echo -e "${GREEN}[✓]${NC} $*"; }
warn()   { echo -e "${YELLOW}[!]${NC} $*"; }
critical(){ echo -e "${RED}[CRÍTICO]${NC} $*"; }

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║      AUDITORÍA DE SEGURIDAD — MiSalud APK (webmedical.cl)   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─── 1. OBTENER EL APK ────────────────────────────────────────────────────────
APK_PATH="${1:-}"

if [ -z "$APK_PATH" ]; then
    log "Intentando obtener APK desde ADB (dispositivo Android conectado)..."
    if command -v adb &>/dev/null && adb devices 2>/dev/null | grep -q "device$"; then
        APK_REMOTE=$(adb shell pm path "$PKG" 2>/dev/null | cut -d: -f2 | tr -d '\r ')
        if [ -n "$APK_REMOTE" ]; then
            adb pull "$APK_REMOTE" "$WORKDIR/misalud.apk"
            APK_PATH="$WORKDIR/misalud.apk"
            ok "APK extraído desde dispositivo: $APK_PATH"
        fi
    fi

    if [ -z "$APK_PATH" ]; then
        log "Intentando descargar desde APKCombo..."
        DL_URL=$(curl -sL "https://apkcombo.com/misalud/$PKG/" \
            -A "Mozilla/5.0 (Linux; Android 10)" \
            | grep -o 'https://[^"]*\.apk[^"]*' | head -1)

        if [ -n "$DL_URL" ]; then
            curl -L -o "$WORKDIR/misalud.apk" "$DL_URL" --progress-bar
            APK_PATH="$WORKDIR/misalud.apk"
            ok "APK descargado: $APK_PATH"
        else
            echo ""
            echo "  No se pudo descargar el APK automáticamente."
            echo ""
            echo "  Opciones manuales:"
            echo "  1. Instala la app en tu teléfono Android y ejecuta:"
            echo "     adb pull \$(adb shell pm path $PKG | cut -d: -f2) misalud.apk"
            echo "  2. Descarga manualmente desde https://apkpure.com o https://apkcombo.com"
            echo "     buscando '$PKG' y pasa la ruta como argumento:"
            echo "     bash $0 /ruta/a/misalud.apk"
            echo ""
            exit 1
        fi
    fi
fi

if [ ! -f "$APK_PATH" ]; then
    echo "Error: no se encontró el APK en '$APK_PATH'"
    exit 1
fi

APK_SIZE=$(du -sh "$APK_PATH" | cut -f1)
ok "APK cargado: $APK_PATH ($APK_SIZE)"

# ─── 2. EXTRAER APK ──────────────────────────────────────────────────────────
log "Extrayendo APK con unzip (rápido, sin decompile completo)..."
EXTRACT_DIR="$WORKDIR/extracted"
mkdir -p "$EXTRACT_DIR"
unzip -q "$APK_PATH" -d "$EXTRACT_DIR" 2>/dev/null || true
ok "Extraído en $EXTRACT_DIR"

# ─── 3. ANÁLISIS DEL MANIFEST ────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SECCIÓN 1: AndroidManifest.xml"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MANIFEST="$EXTRACT_DIR/AndroidManifest.xml"
if [ -f "$MANIFEST" ]; then
    # El manifest en el APK es binario — usar aapt o apktool para leerlo
    if command -v aapt &>/dev/null; then
        aapt dump badging "$APK_PATH" 2>/dev/null | grep -E 'version|package|permission' | head -30
    else
        log "aapt no disponible, usando apktool para decode..."
        APKTOOL_JAR="${APKTOOL_JAR:-apktool.jar}"
        if command -v apktool &>/dev/null || [ -f "$APKTOOL_JAR" ]; then
            APKTOOL_CMD="apktool"
            [ -f "$APKTOOL_JAR" ] && APKTOOL_CMD="java -jar $APKTOOL_JAR"
            DECODE_DIR="$WORKDIR/decoded"
            $APKTOOL_CMD d -f -o "$DECODE_DIR" "$APK_PATH" 2>/dev/null || true
            if [ -f "$DECODE_DIR/AndroidManifest.xml" ]; then
                MANIFEST="$DECODE_DIR/AndroidManifest.xml"
                log "Manifest decodificado correctamente"
            fi
        fi
    fi

    # Verificar debuggable
    if grep -q 'android:debuggable="true"' "$MANIFEST" 2>/dev/null; then
        critical "DEBUG MODE ACTIVO en producción — android:debuggable=true"
        echo "         Esto permite adjuntar depuradores y extraer toda la memoria de la app"
    else
        ok "Debug mode desactivado en producción"
    fi

    # Verificar allowBackup
    if grep -q 'android:allowBackup="true"' "$MANIFEST" 2>/dev/null; then
        warn "android:allowBackup=true — datos de la app se pueden extraer via 'adb backup'"
    fi

    # Extraer permisos
    echo ""
    log "Permisos declarados:"
    grep -o 'android.permission\.[A-Z_]*' "$MANIFEST" 2>/dev/null | sort -u | while read perm; do
        case "$perm" in
            *CAMERA*|*READ_CONTACTS*|*WRITE_CONTACTS*|*READ_CALL_LOG*)
                warn "  $perm (sensible)";;
            *INTERNET*|*NETWORK*)
                echo "    $perm (normal)";;
            *STORAGE*|*READ_EXTERNAL*|*WRITE_EXTERNAL*)
                warn "  $perm (acceso a archivos)";;
            *)
                echo "    $perm";;
        esac
    done
fi

# ─── 4. BUSCAR ARCHIVOS JAVASCRIPT ───────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SECCIÓN 2: Localización del bundle JavaScript"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

JS_FILES=$(find "$EXTRACT_DIR" -name "*.js" -not -path "*/node_modules/*" 2>/dev/null | head -20)
MAIN_BUNDLE=""

if [ -n "$JS_FILES" ]; then
    log "Archivos JavaScript encontrados:"
    find "$EXTRACT_DIR" -name "*.js" 2>/dev/null | while read f; do
        SIZE=$(du -sh "$f" | cut -f1)
        echo "  $SIZE  $(basename $f)  ($f)"
    done | sort -rh | head -15

    # El bundle principal de Ionic suele ser main.js, index.js o runtime.js
    MAIN_BUNDLE=$(find "$EXTRACT_DIR" \( -name "main.js" -o -name "index.js" -o -name "runtime.js" -o -name "vendor.js" -o -name "polyfills.js" \) 2>/dev/null | head -1)
    [ -z "$MAIN_BUNDLE" ] && MAIN_BUNDLE=$(find "$EXTRACT_DIR" -name "*.js" 2>/dev/null -exec du -b {} + | sort -rn | head -1 | cut -f2)

    if [ -n "$MAIN_BUNDLE" ]; then
        BUNDLE_SIZE=$(du -sh "$MAIN_BUNDLE" | cut -f1)
        ok "Bundle principal identificado: $(basename $MAIN_BUNDLE) ($BUNDLE_SIZE)"
    fi
else
    # Buscar en assets/www (estructura Ionic típica)
    log "Buscando en assets/www (estructura Ionic)..."
    find "$EXTRACT_DIR" -path "*/www/*.js" -o -path "*/assets/*.js" 2>/dev/null | head -10
    MAIN_BUNDLE=$(find "$EXTRACT_DIR" -path "*/www/main*" -o -path "*/www/index*" 2>/dev/null | head -1)
fi

# ─── 5. ANÁLISIS DE SECRETOS EN EL BUNDLE ────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SECCIÓN 3: Búsqueda de secretos hardcodeados"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Buscar en todos los JS del APK
JS_SEARCH_DIRS=$(find "$EXTRACT_DIR" -name "*.js" 2>/dev/null | xargs -I{} dirname {} | sort -u | tr '\n' ' ')

if [ -z "$JS_SEARCH_DIRS" ]; then
    warn "No se encontraron archivos .js en el APK"
else

python3 << 'PYEOF'
import re, os, sys, glob

# Directorios a buscar
search_dirs = os.environ.get('SEARCH_DIRS', '').split() or ['.']
extract_dir = os.environ.get('EXTRACT_DIR', '.')

# Patrones de secretos hardcodeados
patterns = {
    # AWS
    'AWS Access Key':       r'AKIA[0-9A-Z]{16}',
    'AWS Secret Key':       r'(?i)aws[_\-\s]*secret[_\-\s]*(?:key|access)["\s:=]+["\']?([A-Za-z0-9/+=]{40})',
    # Google / Firebase
    'Firebase API Key':     r'AIza[0-9A-Za-z\-_]{35}',
    'Firebase DB URL':      r'https://[a-z0-9-]+\.firebaseio\.com',
    'Firebase Storage':     r'[a-z0-9-]+\.appspot\.com',
    'Google Client ID':     r'[0-9]+-[0-9a-zA-Z_]+\.apps\.googleusercontent\.com',
    # Tokens genéricos
    'Bearer Token hard':    r'(?i)(?:authorization|bearer)["\s:=]+["\']Bearer\s+[A-Za-z0-9._\-]{20,}',
    'API Key genérica':     r'(?i)(?:api[_\-]?key|apikey|api_secret|app_key|secret_key)["\s:=]+["\']([A-Za-z0-9\-_]{20,})["\']',
    'Password hard':        r'(?i)(?:password|passwd|pwd)["\s:=]+["\']([^"\']{8,})["\']',
    # JWT
    'JWT Token':            r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}',
    # Stripe
    'Stripe Key':           r'(?:sk|pk)_(test|live)_[0-9a-zA-Z]{24,}',
    # Slack
    'Slack Token':          r'xox[baprs]-[0-9a-zA-Z\-]{10,}',
    # Private Keys
    'Private Key':          r'-----BEGIN (?:RSA |EC )?PRIVATE KEY-----',
    # URLs internas/staging
    'URL interna':          r'https?://(?:localhost|127\.0\.0\.1|192\.168\.|10\.|172\.[12][0-9]\.|staging|dev|internal|api-dev|preprod)[^\s"\']{5,}',
    'URL de API':           r'https?://(?:api|backend|service|services)[\./-][a-zA-Z0-9._\-]+(?:/v[0-9])?',
}

findings = []
endpoints = set()

for js_file in glob.glob(f"{extract_dir}/**/*.js", recursive=True):
    try:
        with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        filename = os.path.relpath(js_file, extract_dir)

        for name, pattern in patterns.items():
            matches = re.findall(pattern, content)
            if matches:
                for match in matches[:5]:  # max 5 por tipo por archivo
                    val = match if isinstance(match, str) else str(match)
                    # Filtrar falsos positivos obvios
                    if any(x in val.lower() for x in ['example', 'test123', 'placeholder', 'your_', '<', '>']):
                        continue
                    findings.append({
                        'tipo': name,
                        'archivo': filename,
                        'valor': val[:80] + ('...' if len(val) > 80 else '')
                    })

        # Extraer URLs de API
        api_urls = re.findall(r'https?://[a-zA-Z0-9._\-]+(?:\.[a-z]{2,})+(?:/[^\s"\'<>]{2,50})?', content)
        for url in api_urls:
            if any(x in url for x in ['webmedical', 'jourmed', 'misalud']):
                endpoints.add(url)

    except Exception as e:
        pass

# Reportar
if findings:
    print(f"\n  ⚠️  SE ENCONTRARON {len(findings)} POSIBLES SECRETOS:\n")
    for f in findings:
        severity = "🔴 CRÍTICO" if any(x in f['tipo'] for x in ['AWS', 'Private', 'JWT', 'Stripe', 'Password']) else "🟡 MEDIO"
        print(f"  {severity}  [{f['tipo']}]")
        print(f"           Archivo: {f['archivo']}")
        print(f"           Valor: {f['valor']}")
        print()
else:
    print("\n  ✓ No se encontraron secretos hardcodeados obvios\n")

if endpoints:
    print(f"\n  📡 ENDPOINTS DE API encontrados en el bundle:")
    for ep in sorted(endpoints):
        print(f"     {ep}")

PYEOF
fi

# Variables para que Python las lea
export EXTRACT_DIR
export SEARCH_DIRS="$JS_SEARCH_DIRS"

# ─── 6. ANÁLISIS DE ENDPOINTS ────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SECCIÓN 4: Endpoints de API en el bundle"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

log "Buscando todas las URLs hardcodeadas..."
find "$EXTRACT_DIR" -name "*.js" -exec \
    grep -ohE 'https?://[a-zA-Z0-9._/-]{10,100}' {} \; 2>/dev/null \
    | grep -v -E '(schema\.org|w3\.org|mozilla\.org|example\.com|cdnjs|bootstrap|jquery|google\.com/maps|gstatic|gravatar)' \
    | sort | uniq -c | sort -rn | head -30

echo ""
log "Buscando rutas de API (patrones /api/, /v1/, /v2/)..."
find "$EXTRACT_DIR" -name "*.js" -exec \
    grep -ohE '"(/api/[^"]{3,60}|/v[0-9]/[^"]{3,60})"' {} \; 2>/dev/null \
    | sort -u | head -40

# ─── 7. VERIFICAR SSL PINNING ────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SECCIÓN 5: SSL Certificate Pinning"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Buscar implementaciones de SSL pinning
SSL_PINNING=$(find "$EXTRACT_DIR" -name "*.js" -exec grep -l "ssl\|pinning\|certificate\|fingerprint\|TrustKit\|TrustManager\|CertificatePinner" {} \; 2>/dev/null)
SSL_PINNING_JAVA=$(find "$EXTRACT_DIR" -name "*.smali" -exec grep -l "CertificatePinner\|X509TrustManager\|checkServerTrusted" {} \; 2>/dev/null)

if [ -n "$SSL_PINNING" ] || [ -n "$SSL_PINNING_JAVA" ]; then
    ok "Referencias a SSL pinning encontradas — posiblemente implementado"
    [ -n "$SSL_PINNING" ] && echo "  JS: $SSL_PINNING"
    [ -n "$SSL_PINNING_JAVA" ] && echo "  Java: $SSL_PINNING_JAVA"
else
    critical "No se encontraron referencias a SSL pinning"
    echo "         Sin SSL pinning, un atacante con control de red puede:"
    echo "         - Interceptar todos los datos médicos en tránsito"
    echo "         - Ver credenciales de acceso"
    echo "         - Modificar respuestas de la API"
fi

# ─── 8. RESUMEN WEB — CABECERAS Y SSL ────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SECCIÓN 6: Seguridad web — SSL y cabeceras HTTP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

DOMAIN="webmedical.cl"
log "Inspeccionando cabeceras HTTPS de $DOMAIN..."

HTTP_HEADERS=$(curl -sI --max-time 10 "https://$DOMAIN" 2>/dev/null || true)
if [ -n "$HTTP_HEADERS" ]; then
    echo "$HTTP_HEADERS" | head -30

    echo ""
    log "Evaluando cabeceras de seguridad:"
    for header in "strict-transport-security" "content-security-policy" "x-frame-options" "x-content-type-options" "referrer-policy" "permissions-policy"; do
        if echo "$HTTP_HEADERS" | grep -qi "^$header:"; then
            ok "  Presente: $header"
        else
            warn "  AUSENTE:  $header"
        fi
    done
else
    warn "No se pudo conectar a $DOMAIN desde este entorno"
fi

# ─── 9. RESUMEN FINAL ────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    RESUMEN DE AUDITORÍA                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Archivos analizados: $(find "$EXTRACT_DIR" -name "*.js" 2>/dev/null | wc -l) JavaScript"
echo "  Directorio de trabajo: $WORKDIR"
echo ""
echo "  PRÓXIMOS PASOS:"
echo "  1. Compartir este output completo con el equipo técnico"
echo "  2. Para cada secreto encontrado: rotarlo INMEDIATAMENTE"
echo "  3. Para SSL pinning: implementar antes del próximo release"
echo "  4. Revisar https://ssllabs.com/ssltest/analyze.html?d=$DOMAIN"
echo ""
