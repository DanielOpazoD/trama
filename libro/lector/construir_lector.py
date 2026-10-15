#!/usr/bin/env python3
"""Construye libro.json para el lector de anotaciones a partir de las fuentes Markdown del libro.

Cada bloque (párrafo, lista, cita, tabla, figura, subtítulo) recibe un id estable, la línea de origen
en las fuentes y la página del PDF donde cae (la numeración impresa, que es la que ve el lector del
PDF). Con eso, una anotación hecha en el lector se puede volcar a las fuentes sin ambigüedad.

Uso: python3 construir_lector.py  (desde libro/lector/; lee ../fuentes/0*.md y ../Hechos_..._revisada.pdf)

index.html es una copia de la página genérica del repositorio DanielOpazoD/lector-anotaciones (web/index.html);
este script es la versión mínima, atada a este libro, de `lector-anotaciones construir`.
"""
import glob
import html
import json
import os
import re
import subprocess
import unicodedata
from datetime import date

DIR = os.path.dirname(os.path.abspath(__file__))
FUENTES = os.path.normpath(os.path.join(DIR, "..", "fuentes"))
PDF = os.path.normpath(os.path.join(DIR, "..", "Hechos_inferencias_incertidumbre_edicion_revisada.pdf"))
OUT = os.path.join(DIR, "libro.json")

ROMANOS = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5}


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:40].rstrip("-") or "s"


def seccion_id(titulo, usados):
    m = re.match(r"Capítulo (\d+)\.", titulo)
    if m:
        base = f"cap-{int(m.group(1)):02d}"
    elif (m := re.match(r"Interludio (I{1,3})\.", titulo)):
        base = f"interludio-{ROMANOS[m.group(1)]}"
    elif (m := re.match(r"PARTE (I{1,3}V?|IV)\.", titulo)):
        base = f"parte-{ROMANOS[m.group(1)]}"
    elif (m := re.match(r"Apéndice ([A-D])\.", titulo)):
        base = f"ap-{m.group(1).lower()}"
    else:
        base = slug(titulo.split(".")[0])
    sid, n = base, 2
    while sid in usados:
        sid, n = f"{base}-{n}", n + 1
    usados.add(sid)
    return sid


def inline(s):
    """Escapa HTML y convierte **negrita** y *cursiva*."""
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w∗])\*([^*\n]+)\*(?!\w)", r"<em>\1</em>", s)
    return s


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", s)


def paginas_pdf():
    """Texto normalizado de cada página física del PDF y el desfase entre página física e impresa."""
    info = subprocess.run(["pdfinfo", PDF], capture_output=True, text=True).stdout
    n = int(re.search(r"Pages:\s+(\d+)", info).group(1))
    textos = []
    for p in range(1, n + 1):
        t = subprocess.run(["pdftotext", "-f", str(p), "-l", str(p), "-layout", PDF, "-"],
                           capture_output=True, text=True).stdout
        t = re.sub(r"-\n\s*", "", t)  # palabras partidas a fin de línea
        textos.append(norm(t))
    # la página impresa 1 es la del Prefacio: la primera que abre con el encabezado corrido y «Prefacio»
    # (las páginas del índice también dicen «Prefacio», pero no llevan encabezado corrido)
    cabecera = norm("HECHOS, INFERENCIAS E INCERTIDUMBRE") + "prefacio"
    desfase = next((i - 1 for i, t in enumerate(textos, 1) if t.startswith(cabecera)), 0)
    return textos, desfase


def parse():
    usados = set()
    secciones = []
    sec = None

    def nueva(titulo, nivel, src):
        nonlocal sec
        sec = {"id": seccion_id(titulo, usados), "titulo": titulo, "nivel": nivel, "src": src, "bloques": []}
        secciones.append(sec)

    def bloque(t, h, src, texto=""):
        if sec is None:
            nueva("Preliminares", 1, src)
        b = {"id": f"{sec['id']}-b{len(sec['bloques']) + 1}", "t": t, "html": h, "src": src}
        if texto:
            b["_texto"] = texto
        sec["bloques"].append(b)

    for f in sorted(glob.glob(os.path.join(FUENTES, "0*.md"))):
        nombre = os.path.basename(f)
        lines = open(f, encoding="utf-8").read().split("\n")
        i = 0
        while i < len(lines):
            l = lines[i]
            src = f"{nombre}:{i + 1}"
            if not l.strip():
                i += 1
                continue
            if l.startswith("[PORTADA]"):
                buf = []
                i += 1
                while not lines[i].startswith("[/PORTADA]"):
                    if lines[i].strip():
                        buf.append(inline(lines[i].strip()))
                    i += 1
                i += 1
                nueva("Portada", 1, src)
                bloque("portada", buf, src)
                continue
            if l.startswith("[LEGAL]"):
                buf = []
                i += 1
                while not lines[i].startswith("[/LEGAL]"):
                    if lines[i].strip():
                        buf.append(inline(lines[i].strip()))
                    i += 1
                i += 1
                nueva("Página legal", 1, src)
                for p in buf:
                    bloque("p", p, src, re.sub(r"<[^>]+>", "", p))
                continue
            if l.startswith("# "):
                nueva(l[2:].strip(), 1, src); i += 1; continue
            if l.startswith("## "):
                nueva(l[3:].strip(), 2, src); i += 1; continue
            if l.startswith("### "):
                bloque("h3", inline(l[4:].strip()), src, l[4:].strip()); i += 1; continue
            if l.startswith("#### "):
                bloque("h4", inline(l[5:].strip()), src, l[5:].strip()); i += 1; continue
            m = re.match(r"^\[FIGURA:\s*(\S+)\s*\|\s*(.+)\]$", l)
            if m:
                bloque("figure", {"src": "figs/" + m.group(1), "caption": inline(m.group(2).strip())}, src, m.group(2).strip())
                i += 1
                continue
            if l.startswith("- "):
                items = []
                while i < len(lines) and lines[i].startswith("- "):
                    items.append(inline(lines[i][2:].strip())); i += 1
                bloque("ul", items, src, " ".join(re.sub(r"<[^>]+>", "", x) for x in items))
                continue
            if re.match(r"^\d+\. ", l):
                items = []
                while i < len(lines) and re.match(r"^\d+\. ", lines[i]):
                    items.append(inline(re.sub(r"^\d+\. ", "", lines[i]).strip())); i += 1
                bloque("ol", items, src, " ".join(re.sub(r"<[^>]+>", "", x) for x in items))
                continue
            if l.startswith("|"):
                filas = []
                while i < len(lines) and lines[i].startswith("|"):
                    if not re.match(r"^\|\s*-{2,}", lines[i]):
                        celdas = [inline(c.strip()) for c in lines[i].strip().strip("|").split("|")]
                        filas.append(celdas)
                    i += 1
                bloque("table", filas, src, " ".join(re.sub(r"<[^>]+>", "", c) for c in filas[0]) if filas else "")
                continue
            if l.startswith("> "):
                buf = []
                while i < len(lines) and lines[i].startswith("> "):
                    buf.append(lines[i][2:].strip()); i += 1
                texto = " ".join(buf)
                bloque("quote", inline(texto), src, texto)
                continue
            # párrafo: líneas consecutivas no vacías que no abren otro bloque
            buf = [l.strip()]
            i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r"^(#{1,4} |- |\d+\. |\||> |\[FIGURA|\[/?PORTADA\]|\[/?LEGAL\])", lines[i]):
                buf.append(lines[i].strip()); i += 1
            texto = " ".join(buf)
            bloque("p", inline(texto), src, texto)
    return secciones


def asignar_paginas(secciones):
    textos, desfase = paginas_pdf()
    n = len(textos)
    cur = 0  # índice físico (0-based) de la última página encontrada
    for sec in secciones:
        for b in sec["bloques"]:
            texto = b.pop("_texto", "")
            key = norm(texto)[:40]
            pagina = None
            if len(key) >= 15:
                for p in range(cur, min(cur + 5, n)):
                    if key in textos[p]:
                        cur = p
                        pagina = p + 1
                        break
            if pagina is None:
                pagina = cur + 1 if (cur > 0 or sec["nivel"] == 2 or sec["titulo"] not in ("Portada", "Página legal")) else None
            b["pagina"] = (pagina - desfase) if (pagina and pagina > desfase) else None
        sec["pagina"] = next((b["pagina"] for b in sec["bloques"] if b.get("pagina")), None)
    return desfase, n


def main():
    secciones = parse()
    desfase, n = asignar_paginas(secciones)
    libro = {
        "formato": 1,
        "id": "hechos-inferencias-e-incertidumbre",
        "titulo": "Hechos, inferencias e incertidumbre",
        "subtitulo": "Metacognición, lenguaje y decisión clínica",
        "autor": "Daniel Opazo",
        "generado": date.today().isoformat(),
        "paginas_fisicas": n,
        "desfase_paginas": desfase,
        "inicio": "prefacio",
        "secciones": secciones,
    }
    json.dump(libro, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    nb = sum(len(s["bloques"]) for s in secciones)
    sin = sum(1 for s in secciones for b in s["bloques"] if b.get("pagina") is None)
    print(f"ok {OUT}: {len(secciones)} secciones, {nb} bloques, {sin} sin página, desfase {desfase}, {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
