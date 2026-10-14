# Extrae las páginas reales de cada entrada del índice desde el PDF de la primera pasada.
# Uso: python3 toc_extract.py [ruta.pdf] [toc_keys.json] [toc.json]
#   por defecto lee ../Hechos_inferencias_incertidumbre_edicion_revisada.pdf (o $LIBRO_OUT/...),
#   toc_keys.json junto al script (lo escribe build_docx.cjs) y deja toc.json junto al script.
# Requiere pdftotext (poppler). Después: node build_docx.cjs --toc toc.json
import json
import os
import re
import subprocess
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.abspath(os.environ.get("LIBRO_OUT", os.path.join(DIR, "..")))
pdf = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT_DIR, "Hechos_inferencias_incertidumbre_edicion_revisada.pdf")
keys_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(DIR, "toc_keys.json")
toc_path = sys.argv[3] if len(sys.argv) > 3 else os.path.join(DIR, "toc.json")

txt = subprocess.run(["pdftotext", pdf, "-"], capture_output=True, text=True).stdout
pages = txt.split("\f")
keys = json.load(open(keys_path, encoding="utf-8"))


def norm(s):
    s = re.sub(r"[.:—–\-]", "", s)
    return re.sub(r"\s+", " ", s).strip().lower()


toc_start = next(i for i, p in enumerate(pages) if "Contenido" in p and "PARTE I" in p)
body_start = next(i for i, p in enumerate(pages)
                  if i > toc_start and any(norm(l) == "prefacio" for l in p.splitlines()))
print("toc_start", toc_start, "body_start", body_start, "total pages", len(pages))

PREF = re.compile(r"^(PARTE [IVX]+|Capítulo \d+|Interludio [IVX]+|Cuaderno de casos|Apéndice [A-Z]|Conclusión|Introducción|Nota metodológica)\.?\s*(.*)$")

toc, missing = {}, []
last = body_start
for k in keys:
    m = PREF.match(k)
    found = None
    for i in range(last, len(pages)):
        p = pages[i]
        lines = [norm(l) for l in p.splitlines()]
        joined = norm(" ".join(p.splitlines()))
        if m and m.group(2):
            pre, title = norm(m.group(1)), norm(m.group(2))
            if (pre in lines or norm(k) in joined) and title in joined:
                found = i
                break
        else:
            if norm(k) in lines:
                found = i
                break
    if found is None:
        missing.append(k)
    else:
        toc[k] = found - body_start + 1
        last = found
json.dump(toc, open(toc_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(toc), "entradas;", "faltan:", missing)
print("paginas cuerpo:", len(pages) - 1 - body_start, "fisicas:", len(pages) - 1)
