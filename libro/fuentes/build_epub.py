# Construye el EPUB (formato Kindle/KDP) desde las fuentes markdown del libro.
# Uso: python3 build_epub.py  ->  Hechos_inferencias_incertidumbre.epub
import re
import subprocess
import sys

FUENTES = ["00_preliminares.md", "01_parte1.md", "02_parte2.md",
           "03_parte3.md", "04_parte4.md", "05_cierre.md"]
SALIDA = "Hechos_inferencias_incertidumbre.epub"

texto = "\n\n".join(open(f, encoding="utf-8").read() for f in FUENTES)

# 1) portada de texto fuera (el EPUB usa imagen de portada + página de título propia)
texto = re.sub(r"\[PORTADA\].*?\[/PORTADA\]\s*", "", texto, flags=re.S)

# 2) bloque legal -> capítulo propio
def legal(m):
    cuerpo = m.group(1).strip()
    return "# Página legal\n\n" + cuerpo + "\n"
texto = re.sub(r"\[LEGAL\](.*?)\[/LEGAL\]", legal, texto, flags=re.S)

# 3) figuras -> imagen estándar con leyenda (pandoc la vuelve <figure>)
texto = re.sub(r"\[FIGURA:\s*(\S+)\s*\|\s*(.*?)\]",
               lambda m: f"![{m.group(2).strip()}](figs/{m.group(1).strip()})",
               texto)

# 4) párrafos «En una frase» -> div con clase para estilo
texto = re.sub(r"(?m)^(\*\*En una frase\.\*\*.*)$",
               r"::: enuna\n\1\n:::", texto)

open("combined_epub.md", "w", encoding="utf-8").write(texto)

open("epub.css", "w", encoding="utf-8").write("""
body { font-family: Georgia, "Liberation Serif", serif; line-height: 1.5; }
h1 { font-size: 1.7em; margin-top: 1.2em; }
h2 { font-size: 1.35em; }
h3 { font-size: 1.12em; }
h4 { background: #efe8dc; border-left: 4px solid #8c2f2f; padding: 0.45em 0.6em;
     font-size: 1.02em; }
blockquote { border-left: 3px solid #8c2f2f; margin: 1em 0;
             padding: 0.2em 0 0.2em 1em; font-style: italic; color: #4a4a4a; }
div.enuna { background: #f2ece2; border-radius: 6px; padding: 0.7em 0.9em;
            margin: 1em 0; }
table { border-collapse: collapse; font-size: 0.85em; margin: 1em 0; }
th, td { border: 1px solid #8a8a8a; padding: 0.35em 0.5em; vertical-align: top; }
img { max-width: 100%; }
figcaption { font-size: 0.85em; color: #555; font-style: italic; text-align: center; }
""")

open("meta_epub.yml", "w", encoding="utf-8").write("""---
title: "Hechos, inferencias e incertidumbre"
subtitle: "Metacognición, lenguaje y decisión clínica"
author: "Daniel Opazo"
date: "2026"
lang: es
rights: "© 2026 Daniel Opazo. Edición de trabajo."
description: >-
  Ensayo académico de integración científico-filosófica sobre metacognición,
  lenguaje y decisión clínica, dirigido a profesionales de la salud.
...
""")

cmd = ["pandoc", "combined_epub.md",
       "-f", "markdown+smart",
       "-o", SALIDA,
       "--metadata-file", "meta_epub.yml",
       "--css", "epub.css",
       "--epub-cover-image", "portada_kindle.jpg",
       "--toc", "--toc-depth=2",
       "--split-level=2"]
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode != 0:
    print(r.stderr)
    sys.exit(1)
if r.stderr.strip():
    print("avisos:", r.stderr.strip()[:600])
print("OK", SALIDA)
