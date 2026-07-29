#!/usr/bin/env python3
"""
analyze_apk_secrets.py
Análisis estático del bundle JavaScript de una app Ionic (MiSalud/webmedical.cl)

Uso:
    python3 analyze_apk_secrets.py misalud.apk
    python3 analyze_apk_secrets.py /ruta/a/directorio/extraido/

Requiere: python3 (stdlib únicamente)
"""

import re
import os
import sys
import json
import zipfile
import tempfile
import shutil
from pathlib import Path
from collections import defaultdict

# ─── Paleta de colores ────────────────────────────────────────────────────────
RED    = "\033[0;31m"
YELLOW = "\033[1;33m"
GREEN  = "\033[0;32m"
BLUE   = "\033[0;34m"
BOLD   = "\033[1m"
NC     = "\033[0m"

def c(color, text): return f"{color}{text}{NC}"

# ─── Patrones de secretos ─────────────────────────────────────────────────────
SECRET_PATTERNS = {
    # Infraestructura cloud
    "AWS Access Key ID":      (re.compile(r'AKIA[0-9A-Z]{16}'), "CRÍTICO"),
    "AWS Secret Access Key":  (re.compile(r'(?i)aws[_\-\s]*secret[^=\n]{0,20}=\s*["\']?([A-Za-z0-9/+=]{40})'), "CRÍTICO"),
    "Google Firebase Key":    (re.compile(r'AIza[0-9A-Za-z\-_]{35}'), "CRÍTICO"),
    "Firebase DB URL":        (re.compile(r'https://[a-z0-9-]+\.firebaseio\.com'), "ALTO"),
    "Firebase Storage":       (re.compile(r'[a-z0-9-]+\.appspot\.com'), "MEDIO"),
    "GCP Service Account":    (re.compile(r'"type":\s*"service_account"'), "CRÍTICO"),
    # Autenticación
    "JWT Token hardcoded":    (re.compile(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'), "ALTO"),
    "Bearer Token":           (re.compile(r'(?i)bearer\s+[A-Za-z0-9._\-]{30,}'), "ALTO"),
    "API Key genérica":       (re.compile(r'(?i)(?:api[_\-]?key|apikey|x-api-key)\s*[=:]\s*["\']([a-zA-Z0-9_\-]{20,})["\']'), "ALTO"),
    "Client Secret":          (re.compile(r'(?i)client[_\-]?secret\s*[=:]\s*["\']([^"\']{10,})["\']'), "CRÍTICO"),
    "Password hardcoded":     (re.compile(r'(?i)(?:password|passwd|contraseña)\s*[=:]\s*["\']([^"\'<>{}]{8,})["\']'), "CRÍTICO"),
    # Pagos
    "Stripe Live Key":        (re.compile(r'sk_live_[0-9a-zA-Z]{24,}'), "CRÍTICO"),
    "Stripe Test Key":        (re.compile(r'sk_test_[0-9a-zA-Z]{24,}'), "MEDIO"),
    # Claves privadas
    "Private Key (RSA/EC)":   (re.compile(r'-----BEGIN (?:RSA |EC )?PRIVATE KEY-----'), "CRÍTICO"),
    # URLs sensibles
    "URL de staging/dev":     (re.compile(r'https?://(?:staging|dev|develop|test|preprod|internal|qa)[.\-][a-zA-Z0-9._\-]+'), "MEDIO"),
    "URL localhost":          (re.compile(r'https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0)'), "BAJO"),
    "IP privada hardcoded":   (re.compile(r'https?://(?:10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)'), "MEDIO"),
    # Servicios de analytics/monitoring
    "Sentry DSN":             (re.compile(r'https://[a-f0-9]+@[a-z0-9.]+\.sentry\.io/[0-9]+'), "BAJO"),
    "Mixpanel Token":         (re.compile(r'(?i)mixpanel[^=\n]{0,20}=\s*["\']([a-f0-9]{32})["\']'), "BAJO"),
    "Intercom App ID":        (re.compile(r'(?i)intercom[^=\n]{0,20}=\s*["\']([a-zA-Z0-9]{8,})["\']'), "BAJO"),
}

# Falsos positivos a filtrar
FALSE_POSITIVE_VALUES = {
    'example', 'placeholder', 'your_', 'insert_', 'dummy',
    'test123', 'password123', 'changeme', 'xxxx', '####',
    'undefined', 'null', 'true', 'false', 'YOUR_KEY',
    '0000000', 'aaaaaaaa', '12345678', 'abcdefgh',
}


def is_false_positive(value: str) -> bool:
    v = value.lower()
    return any(fp in v for fp in FALSE_POSITIVE_VALUES) or len(value.strip()) < 8


# ─── Extracción del APK ──────────────────────────────────────────────────────
def extract_apk(apk_path: str) -> Path:
    extract_dir = Path(tempfile.mkdtemp()) / "apk_extracted"
    print(c(BLUE, f"[*] Extrayendo {apk_path}..."))
    with zipfile.ZipFile(apk_path, 'r') as z:
        z.extractall(extract_dir)
    print(c(GREEN, f"[✓] Extraído en {extract_dir}"))
    return extract_dir


# ─── Localizar bundles JS ─────────────────────────────────────────────────────
def find_js_bundles(root: Path) -> list[Path]:
    js_files = list(root.rglob("*.js"))
    # Ordenar por tamaño descendente (el bundle principal es el más grande)
    js_files.sort(key=lambda f: f.stat().st_size, reverse=True)
    return js_files


# ─── Análisis de secretos ─────────────────────────────────────────────────────
def analyze_secrets(js_files: list[Path], root: Path) -> dict:
    findings = defaultdict(list)
    all_urls = set()
    api_paths = set()

    for js_file in js_files:
        try:
            content = js_file.read_text(encoding='utf-8', errors='ignore')
            rel_path = js_file.relative_to(root)
        except Exception:
            continue

        # Buscar secretos
        for secret_name, (pattern, severity) in SECRET_PATTERNS.items():
            for match in pattern.finditer(content):
                value = match.group(0)
                if is_false_positive(value):
                    continue
                # Contexto (30 chars antes y después)
                start = max(0, match.start() - 30)
                end   = min(len(content), match.end() + 30)
                context = content[start:end].replace('\n', ' ')
                findings[severity].append({
                    'tipo':    secret_name,
                    'archivo': str(rel_path),
                    'valor':   value[:100],
                    'contexto': context[:120],
                })

        # Extraer URLs
        for url in re.findall(r'https?://[a-zA-Z0-9._/\-?=&%:]+', content):
            if any(x in url for x in ['webmedical', 'jourmed', 'misalud', 'api']):
                if len(url) > 15:
                    all_urls.add(url)

        # Extraer rutas de API
        for path in re.findall(r'["\'](/(?:api|v[0-9]|auth|user|patient|histor|record|exam)[^"\']{2,80})["\']', content):
            api_paths.add(path)

    return {
        'findings': dict(findings),
        'urls': sorted(all_urls),
        'api_paths': sorted(api_paths),
    }


# ─── Análisis del manifest ────────────────────────────────────────────────────
def analyze_manifest(root: Path) -> dict:
    manifest_path = root / "AndroidManifest.xml"
    if not manifest_path.exists():
        return {'error': 'Manifest no encontrado (APK con manifest binario — usar apktool)'}

    try:
        content = manifest_path.read_text(errors='ignore')
    except Exception as e:
        return {'error': str(e)}

    result = {}
    result['debuggable']   = 'android:debuggable="true"' in content
    result['allowBackup']  = 'android:allowBackup="true"' in content
    result['permissions']  = re.findall(r'android\.permission\.[A-Z_]+', content)
    result['version_name'] = re.search(r'android:versionName="([^"]+)"', content)
    if result['version_name']:
        result['version_name'] = result['version_name'].group(1)

    return result


# ─── Verificar SSL pinning ─────────────────────────────────────────────────────
def check_ssl_pinning(root: Path) -> dict:
    pinning_indicators = [
        'CertificatePinner', 'ssl-pinning', 'sslPinning', 'TrustKit',
        'publicKeyHash', 'certificate-pinning', 'pinnedCertificate',
        'capacitor-ssl-pinning', 'cordova-plugin-advanced-http',
    ]
    found_in = []
    for js_file in root.rglob("*.js"):
        try:
            content = js_file.read_text(errors='ignore')
            if any(ind.lower() in content.lower() for ind in pinning_indicators):
                found_in.append(str(js_file.relative_to(root)))
        except Exception:
            pass
    return {'implemented': len(found_in) > 0, 'files': found_in}


# ─── Impresión de resultados ──────────────────────────────────────────────────
def print_report(root: Path, js_files: list, analysis: dict, manifest: dict, pinning: dict):
    print()
    print(c(BOLD, "=" * 65))
    print(c(BOLD, "  REPORTE DE ANÁLISIS — MiSalud APK (webmedical.cl)"))
    print(c(BOLD, "=" * 65))

    # Stats
    total_js_size = sum(f.stat().st_size for f in js_files) / 1024 / 1024
    print(f"\n  Archivos JS analizados: {len(js_files)} ({total_js_size:.1f} MB)")

    # Manifest
    print(c(BOLD, "\n── MANIFEST ──────────────────────────────────────────────────"))
    if 'error' in manifest:
        print(c(YELLOW, f"  ! {manifest['error']}"))
        print(  "    Ejecutar: apktool d misalud.apk -o decoded/")
        print(  "    Luego: cat decoded/AndroidManifest.xml")
    else:
        v = manifest.get('version_name', '?')
        print(f"  Versión: {v}")

        if manifest.get('debuggable'):
            print(c(RED, "  [CRÍTICO] android:debuggable=true — debug activo en producción"))
        else:
            print(c(GREEN, "  [✓] Debug desactivado"))

        if manifest.get('allowBackup'):
            print(c(YELLOW, "  [!] android:allowBackup=true — datos extraíbles via 'adb backup'"))

        perms = manifest.get('permissions', [])
        sensitive = [p for p in perms if any(x in p for x in ['CAMERA', 'CONTACTS', 'CALL_LOG', 'RECORD_AUDIO', 'LOCATION', 'BODY_SENSORS'])]
        if sensitive:
            print(f"\n  Permisos sensibles ({len(sensitive)}):")
            for p in sensitive:
                print(c(YELLOW, f"    ! {p}"))

    # Secretos
    print(c(BOLD, "\n── SECRETOS HARDCODEADOS ─────────────────────────────────────"))
    findings = analysis['findings']
    severity_order = ['CRÍTICO', 'ALTO', 'MEDIO', 'BAJO']
    severity_colors = {'CRÍTICO': RED, 'ALTO': YELLOW, 'MEDIO': YELLOW, 'BAJO': BLUE}

    total = sum(len(v) for v in findings.values())
    if total == 0:
        print(c(GREEN, "  [✓] No se encontraron secretos hardcodeados obvios"))
        print(  "      (Verificar manualmente con: grep -r 'apiKey\\|secret\\|password' assets/www/)")
    else:
        print(c(RED, f"\n  ⚠️  {total} posibles secreto(s) encontrado(s):\n"))
        for sev in severity_order:
            for f in findings.get(sev, []):
                col = severity_colors[sev]
                print(c(col, f"  [{sev}] {f['tipo']}"))
                print(f"         Archivo:   {f['archivo']}")
                print(f"         Valor:     {f['valor']}")
                print(f"         Contexto:  ...{f['contexto']}...")
                print()

    # URLs y endpoints
    print(c(BOLD, "\n── ENDPOINTS DE API ENCONTRADOS ──────────────────────────────"))
    urls = analysis['urls']
    paths = analysis['api_paths']

    if urls:
        print(f"\n  URLs con dominio propio ({len(urls)}):")
        for u in urls[:20]:
            print(f"    {u}")
    else:
        print("  No se encontraron URLs de dominio propio en el bundle")

    if paths:
        print(f"\n  Rutas de API ({len(paths)}):")
        for p in paths[:30]:
            print(f"    {p}")
    else:
        print("  No se encontraron rutas /api/ explícitas")
        print("  Buscar manualmente: grep -ohE '\"/[a-z]*/[a-z]*\"' assets/www/main.js | sort -u")

    # SSL Pinning
    print(c(BOLD, "\n── SSL CERTIFICATE PINNING ───────────────────────────────────"))
    if pinning['implemented']:
        print(c(GREEN, f"  [✓] SSL Pinning detectado en: {pinning['files']}"))
    else:
        print(c(RED,  "  [CRÍTICO] SSL Pinning NO implementado"))
        print(        "            Sin pinning, en cualquier WiFi controlada por un atacante:")
        print(        "            → Las credenciales de login viajan descifradas al atacante")
        print(        "            → Los historiales médicos son interceptables en tiempo real")
        print(        "            → El atacante puede modificar respuestas de la API")
        print()
        print(        "  Solución: implementar capacitor-ssl-pinning o TrustKit")
        print(        "  Ejemplo: https://github.com/ionic-team/capacitor-ssl-pinning")

    # Resumen
    critical_count = len(findings.get('CRÍTICO', []))
    high_count     = len(findings.get('ALTO', []))
    print(c(BOLD, "\n── RESUMEN ───────────────────────────────────────────────────"))
    print(f"\n  Secretos críticos:  {c(RED, str(critical_count)) if critical_count else c(GREEN, '0')}")
    print(f"  Secretos altos:     {c(YELLOW, str(high_count)) if high_count else c(GREEN, '0')}")
    print(f"  SSL Pinning:        {c(RED, 'NO') if not pinning['implemented'] else c(GREEN, 'SÍ')}")
    print()

    if critical_count > 0:
        print(c(RED, "  ACCIÓN INMEDIATA: Rotar todas las credenciales encontradas antes"))
        print(c(RED, "  de continuar con el uso del servicio en producción."))
    print()


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        print(f"Uso: python3 {sys.argv[0]} <misalud.apk | directorio_extraido>")
        sys.exit(1)

    target = sys.argv[1]
    cleanup = False

    if os.path.isfile(target) and target.endswith('.apk'):
        root = extract_apk(target)
        cleanup = True
    elif os.path.isdir(target):
        root = Path(target)
    else:
        print(f"Error: '{target}' no es un APK ni un directorio")
        sys.exit(1)

    print(c(BLUE, "[*] Localizando archivos JavaScript..."))
    js_files = find_js_bundles(root)
    if not js_files:
        print(c(YELLOW, "  No se encontraron archivos .js — verificar estructura del APK"))
    else:
        print(c(GREEN, f"[✓] {len(js_files)} archivos JS encontrados"))
        for f in js_files[:5]:
            size_kb = f.stat().st_size / 1024
            print(f"    {size_kb:8.0f} KB  {f.relative_to(root)}")
        if len(js_files) > 5:
            print(f"    ... y {len(js_files)-5} más")

    print(c(BLUE, "\n[*] Analizando secretos (esto puede tomar 1-2 minutos)..."))
    analysis = analyze_secrets(js_files, root)

    print(c(BLUE, "[*] Analizando AndroidManifest.xml..."))
    manifest = analyze_manifest(root)

    print(c(BLUE, "[*] Verificando SSL pinning..."))
    pinning = check_ssl_pinning(root)

    print_report(root, js_files, analysis, manifest, pinning)

    # Guardar JSON con resultados
    output = {
        'target': target,
        'manifest': manifest,
        'secrets': {k: len(v) for k, v in analysis['findings'].items()},
        'urls_found': analysis['urls'],
        'api_paths': analysis['api_paths'],
        'ssl_pinning': pinning['implemented'],
    }
    out_file = "misalud-audit-results.json"
    with open(out_file, 'w') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(c(BLUE, f"  Resultados guardados en: {out_file}"))

    if cleanup:
        shutil.rmtree(root.parent, ignore_errors=True)


if __name__ == '__main__':
    main()
