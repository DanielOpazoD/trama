#!/usr/bin/env python3
"""Cotejo del texto de las figuras contra el léxico canónico del libro.

Las figuras se generan desde figuras.py y su texto no está en las fuentes Markdown, así que las
pasadas de coherencia no lo ven. Este script extrae todas las cadenas de figuras.py y comprueba:
  1. que no contengan variantes retiradas (terminos_canonicos.md y la escala de certeza);
  2. que no usen comillas rectas ni decimales con punto (el libro escribe «» y «6,0»);
  3. que, si citan las cuatro preguntas, usen la redacción canónica de la tarjeta;
  4. que cada [FIGURA: archivo | leyenda] del cuerpo exista en ../figs/.
Sale con código 1 si encuentra algo. Uso: python3 cotejo_figuras.py (desde fuentes/).
"""
import ast
import glob
import os
import re
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
FIGS = os.path.normpath(os.path.join(DIR, "..", "figs"))

RETIRADAS = [
    "no sustentado", "60 segundos", "relleno capilar", "historia clínica", "condición de reapertura",
    "criterio de reevaluación", "criterios de reevaluación", "cláusula de cierre", "frase clínica medular",
    "exceso de confianza", "safety-netting (red", "Semana 6", "SEMANA 6",
]
PREGUNTAS = [
    "¿Qué vi y qué me contaron?",
    "¿Qué creo y cuánto derecho tengo a creerlo?",
    "¿Qué daño importante podría producir si estoy equivocado?",
    "¿Qué hago y qué me haría cambiar antes del próximo control?",
]


def cadenas(path):
    tree = ast.parse(open(path, encoding="utf-8").read())
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and len(node.value) > 3:
            yield node.lineno, node.value


def main():
    fallas = []
    for ln, s in cadenas(os.path.join(DIR, "figuras.py")):
        if s.endswith(".png") or s.startswith("#") or "/" in s and " " not in s:
            continue
        for v in RETIRADAS:
            if v.lower() in s.lower():
                fallas.append(f"figuras.py:{ln}: variante retirada «{v}» en: {s[:70]!r}")
        if '"' in s:
            fallas.append(f"figuras.py:{ln}: comillas rectas en: {s[:70]!r}")
        if re.search(r"\d\.\d(?!\d)", s):
            fallas.append(f"figuras.py:{ln}: decimal con punto en: {s[:70]!r}")
        if "¿Qué vi" in s or "¿qué vi" in s:
            for q in PREGUNTAS:
                if q not in s:
                    fallas.append(f"figuras.py:{ln}: las cuatro preguntas no siguen la tarjeta (falta «{q}»)")
    # leyendas del cuerpo ↔ archivos
    for src in sorted(glob.glob(os.path.join(DIR, "0*.md"))):
        for m in re.finditer(r"^\[FIGURA:\s*(\S+)\s*\|", open(src, encoding="utf-8").read(), re.M):
            if not os.path.exists(os.path.join(FIGS, m.group(1))):
                fallas.append(f"{os.path.basename(src)}: falta el archivo de figura {m.group(1)}")
    if fallas:
        print("\n".join(fallas))
        print(f"{len(fallas)} problema(s) en el texto de las figuras")
        return 1
    print("cotejo de figuras: sin derivas (variantes retiradas, comillas rectas, decimales, cuatro preguntas, archivos)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
