#!/usr/bin/env python3
"""Construye libro.json para el lector de anotaciones de este libro.

Usa el paquete genérico `lector-anotaciones` (https://github.com/DanielOpazoD/lector-anotaciones), fijado en el
commit de la página que se publica:

    pip install -r ../requirements.txt

y le pasa lo que es propio de este libro: las fuentes `0*.md`, el PDF maquetado (para la página impresa
de cada bloque), la marca de la página 1, la clave de respaldo de la primera versión de la página, los
términos retirados del léxico (los mismos de `cotejo_figuras.py`) y la salida anterior, para que la
página marque qué bloques cambiaron. index.html es copia de web/index.html de ese repositorio.

Uso: python3 construir_lector.py   (desde la carpeta lector/)
"""

import glob
import os
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
FUENTES = os.path.normpath(os.path.join(DIR, "..", "fuentes"))
PDF = os.path.normpath(os.path.join(DIR, "..", "Hechos_inferencias_incertidumbre_edicion_revisada.pdf"))
OUT = os.path.join(DIR, "libro.json")

try:
    from lector_anotaciones.capas import ConfigCapas
    from lector_anotaciones.construir import cargar_anterior, construir, escribir, resumen, validar
except ImportError:
    sys.exit("Falta el paquete lector-anotaciones: pip install -r ../requirements.txt")

sys.dont_write_bytecode = True  # no dejar __pycache__ en fuentes/ al importar el cotejo
sys.path.insert(0, FUENTES)
from cotejo_figuras import RETIRADAS  # noqa: E402  (la lista canónica de variantes retiradas del léxico)


def main():
    avisos = []
    libro = construir(
        sorted(glob.glob(os.path.join(FUENTES, "0*.md"))),
        pdf=PDF if os.path.exists(PDF) else None,
        titulo="Hechos, inferencias e incertidumbre",
        subtitulo="Metacognición, lenguaje y decisión clínica",
        autor="Daniel Opazo",
        figs="figs/",
        marca_pagina_1="HECHOS, INFERENCIAS E INCERTIDUMBRE Prefacio",
        claves_anteriores=["lector-hiid-anotaciones"],
        anterior=cargar_anterior(OUT),
        capas=ConfigCapas(terminos_retirados=list(RETIRADAS)),
        avisos=avisos,
    )
    libro["inicio"] = "prefacio"
    for a in avisos:
        print("aviso:", a, file=sys.stderr)
    problemas = validar(libro)
    for p in problemas:
        print("problema:", p, file=sys.stderr)
    tam = escribir(libro, OUT)
    print(f"ok {OUT}: {resumen(libro)}, {tam // 1024} KB")
    return 1 if problemas else 0


if __name__ == "__main__":
    sys.exit(main())
