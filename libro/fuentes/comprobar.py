#!/usr/bin/env python3
"""Comprobaciones del libro que no dependen de mirar. Sale con 1 si alguna falla.

- Referencias: cada entrada de «# Referencias» (05_cierre.md) se cita en el cuerpo (apellido y año en la misma
  cita), y cada año entre paréntesis del cuerpo que acompaña a un apellido tiene su entrada.
- Figuras: las marcas `[FIGURA: archivo | Figura N. …]` van numeradas 1, 2, 3… sin saltos.
- TOC: `toc.json` tiene una página para cada entrada de `toc_keys.json`.
- PDF (si existe y hay pdftotext): cero comillas rectas en el texto maquetado.

Uso (desde fuentes/): python3 comprobar.py
`cotejo_figuras.py` revisa aparte el texto de las figuras; `construir.sh` corre los dos al final.
"""

import glob
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata

DIR = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(
    os.environ.get("LIBRO_OUT", os.path.join(DIR, "..")), "Hechos_inferencias_incertidumbre_edicion_revisada.pdf"
)


def ascii(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def fuentes():
    src = {os.path.basename(f): open(f, encoding="utf-8").read() for f in sorted(glob.glob(os.path.join(DIR, "0*.md")))}
    cierre = src["05_cierre.md"]
    i = cierre.index("# Referencias")
    j = cierre.index("\n# ", i + 1)
    refs = [linea for linea in cierre[i:j].split("\n") if linea.strip() and not linea.startswith("#")]
    cuerpo = "".join(src.values()).replace(cierre[i:j], "")
    return refs, cuerpo


def referencias(refs, cuerpo):
    problemas = []
    texto = ascii(cuerpo)
    pares = set()  # (apellido, año) de cada autor de cada entrada
    for r in refs:
        r = ascii(r)
        anio = re.search(r"\((\d{4}[a-z]?)", r)
        primero = re.match(r"([^,(]+?)(?:,| &|\s\()", r)
        if not anio or not primero:
            problemas.append(f"referencia sin apellido o sin año: {r[:70]}")
            continue
        for w in re.findall(r"[A-Z][A-Za-z'\-]+", r[: anio.start()]):
            pares.add((w, anio.group(1)))
        apellido = primero.group(1).strip().rstrip(".")
        if not re.search(re.escape(apellido) + r"[^()]{0,160}?" + re.escape(anio.group(1)), texto):
            problemas.append(f"referencia sin citar: {r[:70]}")
    # cada cita de un paréntesis («(A, 2019; B & C, 2020)»); la primera mira también lo que precede («A (2019)»)
    for m in re.finditer(r"\(([^()]*\d{4}[a-z]?[^()]*)\)", texto):
        for k, cita in enumerate(m.group(1).split(";")):
            contexto = cita if k else texto[max(0, m.start() - 80) : m.start()] + cita
            palabras = re.findall(r"[A-Z][A-Za-z'\-]+", contexto)
            for anio in re.findall(r"\b(\d{4}[a-z]?)\b", cita):
                if palabras and not any((w, anio) in pares for w in palabras):
                    problemas.append(f"cita sin entrada en Referencias: «…{contexto.strip()[-60:]}»")
    return problemas, len(refs)


def figuras(cuerpo):
    nums = [int(n) for n in re.findall(r"\[FIGURA: \S+ \| Figura (\d+)\.", cuerpo)]
    if nums != list(range(1, len(nums) + 1)):
        return [f"figuras fuera de orden o con saltos: {nums}"], len(nums)
    return [], len(nums)


def toc():
    claves = json.load(open(os.path.join(DIR, "toc_keys.json"), encoding="utf-8"))
    paginas = json.load(open(os.path.join(DIR, "toc.json"), encoding="utf-8"))
    faltan = [k for k in claves if k not in paginas]
    return ([f"entradas del TOC sin página: {faltan}"] if faltan else []), len(claves)


def pdf():
    if not os.path.exists(PDF) or not shutil.which("pdftotext"):
        return [], None
    t = subprocess.run(["pdftotext", PDF, "-"], capture_output=True, text=True, check=True).stdout
    rectas = t.count('"')
    return ([f"{rectas} comillas rectas en el PDF"] if rectas else []), rectas


def main():
    refs, cuerpo = fuentes()
    problemas = []
    p, n_refs = referencias(refs, cuerpo)
    problemas += p
    p, n_figs = figuras(cuerpo)
    problemas += p
    p, n_toc = toc()
    problemas += p
    p, rectas = pdf()
    problemas += p
    for x in problemas:
        print("problema:", x)
    estado_pdf = "sin PDF" if rectas is None else f"{rectas} comillas rectas en el PDF"
    print(f"{n_refs} referencias, {n_figs} figuras, TOC {n_toc} entradas, {estado_pdf}: {len(problemas)} problemas")
    return 1 if problemas else 0


if __name__ == "__main__":
    sys.exit(main())
