"""Genera las 15 figuras del libro en estilo editorial sobrio (grises + un acento)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import os

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "figs"))
os.makedirs(OUT, exist_ok=True)

INK = "#2b2b2b"
GRIS = "#8a8a8a"
CLARO = "#f2f0ec"
ACENTO = "#8c2f2f"      # rojo ladrillo apagado
ACENTO2 = "#3d5a6c"     # azul pizarra

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 10,
    "text.color": INK,
    "axes.edgecolor": INK,
})


def caja(ax, x, y, w, h, texto, fc=CLARO, ec=INK, fs=10, bold=False, tc=None, lw=1.2):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.012,rounding_size=0.015",
                                fc=fc, ec=ec, lw=lw, mutation_aspect=1))
    ax.text(x + w / 2, y + h / 2, texto, ha="center", va="center", fontsize=fs,
            fontweight="bold" if bold else "normal", color=tc or INK, wrap=True)


def flecha(ax, x1, y1, x2, y2, color=INK, lw=1.6, estilo="-|>", rad=0.0, ls="-"):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=estilo, mutation_scale=14,
                                 color=color, lw=lw, linestyle=ls,
                                 connectionstyle=f"arc3,rad={rad}"))


def guardar(fig, nombre):
    fig.savefig(os.path.join(OUT, nombre), dpi=300, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("ok", nombre)


# ---------------------------------------------------------------- fig01 capas
fig, ax = plt.subplots(figsize=(7.2, 3.9))
ax.set_xlim(0, 10); ax.set_ylim(0, 5.2); ax.axis("off")
capas = [
    ("HECHOS", "observación,\nmedición,\nprocedencia"),
    ("INFERENCIAS", "hipótesis y\nexplicaciones\ngraduadas"),
    ("INCERTIDUMBRE", "lo que puede\ncambiar el modelo\no la conducta"),
    ("DECISIÓN", "umbrales y\nconsecuencias,\nno certeza"),
]
w, h, gap, x0, y0 = 2.22, 1.9, 0.26, 0.2, 2.15
for i, (t, s) in enumerate(capas):
    x = x0 + i * (w + gap)
    caja(ax, x, y0, w, h, "", fc="white", ec=INK, lw=1.4)
    ax.text(x + w / 2, y0 + h - 0.42, t, ha="center", va="center", fontsize=9.0,
            fontweight="bold", color=ACENTO2)
    ax.text(x + w / 2, y0 + h / 2 - 0.28, s, ha="center", va="center", fontsize=8.6, color=INK)
    if i < 3:
        flecha(ax, x + w + 0.04, y0 + h / 2, x + w + gap - 0.04, y0 + h / 2)
# franja transversal: la incertidumbre no es sólo una etapa
caja(ax, 0.2, 1.28, 9.46, 0.5, "", fc=ACENTO, ec="none")
ax.patches[-1].set_alpha(0.14)
ax.text(5.0, 1.53, "LA INCERTIDUMBRE ATRAVIESA TODAS LAS CAPAS — no espera su turno",
        ha="center", va="center", fontsize=8.8, style="italic", color=ACENTO)
for i in range(4):
    xc = x0 + i * (w + gap) + w / 2
    ax.plot([xc, xc], [1.78, y0], color=ACENTO, lw=1.0, ls=":", alpha=0.65)
# bucle de reevaluación (vuelve a la pregunta y a los hechos)
flecha(ax, x0 + 3 * (w + gap) + w / 2, 1.05, x0 + w / 2, 1.05, color=ACENTO,
       lw=1.8, rad=-0.16)
ax.text(5.0, 0.16, "REEVALUACIÓN — vuelve a la pregunta y a los hechos; toda formulación es temporal",
        ha="center", fontsize=9.2, style="italic", color=ACENTO)
ax.text(5.0, 4.92, "Cada capa se apoya en la anterior; la separación es funcional y gradual — no son compartimentos ontológicos puros",
        ha="center", fontsize=8.4, color=GRIS, style="italic")
guardar(fig, "fig01_capas.png")

# ------------------------------------------------------------ fig02 facticidad
fig, ax = plt.subplots(figsize=(7.2, 4.4))
ax.set_xlim(0, 10); ax.set_ylim(0, 6.2); ax.axis("off")
niveles = [
    ("Dato medido y verificable", "«Lactato 6,0 mmol/L (04:15, arterial)»", 0.92),
    ("Observación profesional reproducible", "«Llene capilar 5 s, documentado por enfermería»", 0.74),
    ("Relato del paciente o de un tercero", "«Esta vez el dolor era otro»", 0.56),
    ("Dato heredado de una nota anterior", "«ITU a repetición» (origen no verificado)", 0.38),
    ("Ausencia inferida del registro", "«Sin episodios previos» = no consignados", 0.20),
]
y = 5.15
for i, (t, ej, alpha) in enumerate(niveles):
    wl = 6.4 - i * 0.55
    caja(ax, 0.4, y, wl, 0.78, "", fc=ACENTO2, ec="none")
    ax.patches[-1].set_alpha(alpha)
    ax.text(0.65, y + 0.39, t, ha="left", va="center", fontsize=9.6, fontweight="bold",
            color="white" if alpha > 0.45 else INK)
    ax.text(7.15, y + 0.39, ej, ha="left", va="center", fontsize=8.4, color=GRIS, style="italic")
    y -= 0.98
flecha(ax, 0.12, 1.0, 0.12, 5.8, color=GRIS, lw=1.4)
ax.text(-0.06, 3.4, "mayor verificabilidad externa directa", rotation=90, ha="center", va="center", fontsize=7.6, color=GRIS)
ax.text(5.0, 0.25, "Ordena verificabilidad, no valor: cada fuente ofrece un acceso privilegiado distinto y exige un lenguaje distinto",
        ha="center", fontsize=8.6, color=GRIS, style="italic")
guardar(fig, "fig02_facticidad.png")

# --------------------------------------------------------- fig03 incertidumbre
fig, ax = plt.subplots(figsize=(7.2, 4.2))
ax.set_xlim(0, 10); ax.set_ylim(0, 5.6); ax.axis("off")
fuentes = [("PROBABILIDAD", "riesgo, azar,\nindeterminación futura"),
           ("AMBIGÜEDAD", "información imprecisa,\ncontradictoria o de\nvalidez discutida"),
           ("COMPLEJIDAD", "múltiples causas,\ncondiciones y efectos\nentrelazados")]
objetos = ["diagnóstico", "pronóstico", "tratamiento", "sistema de atención"]
for i, (t, s) in enumerate(fuentes):
    x = 0.4 + i * 3.15
    caja(ax, x, 3.1, 2.85, 1.7, "", fc="white", ec=ACENTO2, lw=1.4)
    ax.text(x + 1.42, 4.42, t, ha="center", fontsize=10, fontweight="bold", color=ACENTO2)
    ax.text(x + 1.42, 3.78, s, ha="center", va="center", fontsize=8.4)
    flecha(ax, x + 1.42, 3.02, x + 1.42, 2.45, color=GRIS, lw=1.3)
ax.text(5.0, 5.25, "FUENTES de la incertidumbre (Han et al., 2011)", ha="center",
        fontsize=9.2, color=GRIS)
caja(ax, 0.4, 1.55, 9.2, 0.85, "", fc=CLARO, ec=INK, lw=1.2)
ax.text(5.0, 2.18, "OBJETOS sobre los que recae", ha="center", fontsize=9.2, color=GRIS)
for o, xo in zip(objetos, [1.45, 3.6, 5.8, 8.25]):
    ax.text(xo, 1.97, o, ha="center", va="center", fontsize=9.2, fontweight="bold")
ax.text(5.0, 0.85, "Cada combinación pide una respuesta distinta:", ha="center", fontsize=9, color=INK)
ax.text(5.0, 0.42, "reducir con información  ·  aclarar con evolución  ·  tolerar con vigilancia  ·  conversar (valores)",
        ha="center", fontsize=9, color=ACENTO, style="italic")
guardar(fig, "fig03_incertidumbre.png")

# -------------------------------------------------------- fig04 nelson-narens
fig, ax = plt.subplots(figsize=(6.6, 3.8))
ax.set_xlim(0, 10); ax.set_ylim(0, 5.2); ax.axis("off")
caja(ax, 2.1, 3.35, 5.8, 1.35, "", fc="white", ec=ACENTO2, lw=1.5)
ax.text(5.0, 4.32, "NIVEL META", ha="center", fontsize=10.5, fontweight="bold", color=ACENTO2)
ax.text(5.0, 3.82, "¿comprendí?, ¿cuánto confío?, ¿sigo, freno,\npido ayuda, busco alternativa?",
        ha="center", va="center", fontsize=8.6)
caja(ax, 2.1, 0.55, 5.8, 1.35, "", fc=CLARO, ec=INK, lw=1.4)
ax.text(5.0, 1.52, "NIVEL OBJETO", ha="center", fontsize=10.5, fontweight="bold")
ax.text(5.0, 1.02, "reconocer patrones, recordar enfermedades,\nexaminar, pedir exámenes, decidir",
        ha="center", va="center", fontsize=8.6)
flecha(ax, 3.1, 1.95, 3.1, 3.3, color=INK, lw=1.7)
ax.text(2.75, 2.62, "monitoreo", rotation=90, ha="center", va="center", fontsize=8.8, color=GRIS)
flecha(ax, 6.9, 3.3, 6.9, 1.95, color=ACENTO, lw=1.7)
ax.text(7.3, 2.62, "control", rotation=270, ha="center", va="center", fontsize=8.8, color=ACENTO)
ax.text(5.0, 0.12, "Ambos niveles usan señales imperfectas: la supervisión también puede equivocarse",
        ha="center", fontsize=8.6, color=GRIS, style="italic")
guardar(fig, "fig04_nelson_narens.png")

# ---------------------------------------------------------- fig05 calibración
fig, ax = plt.subplots(figsize=(5.6, 4.6))
conf = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
sobre = [0.48, 0.54, 0.60, 0.66, 0.72, 0.78]
ax.plot([0.5, 1.0], [0.5, 1.0], color=GRIS, lw=1.6, ls="--", label="Calibración perfecta")
ax.plot(conf, sobre, color=ACENTO, lw=2.2, marker="o", ms=5, label="Sobreconfianza (curva esquemática)")
ax.fill_between([0.5, 1.0], [0.5, 1.0], [0.35, 0.35], color=ACENTO, alpha=0.05)
ax.set_xlabel("Confianza declarada", fontsize=10)
ax.set_ylabel("Proporción real de aciertos", fontsize=10)
ax.set_xlim(0.48, 1.02); ax.set_ylim(0.35, 1.02)
ax.set_xticks([0.5, 0.6, 0.7, 0.8, 0.9, 1.0]); ax.set_yticks([0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0])
ax.tick_params(labelsize=8.5)
from matplotlib.ticker import FuncFormatter
coma = FuncFormatter(lambda v, p: f"{v:.1f}".replace(".", ","))
ax.xaxis.set_major_formatter(coma); ax.yaxis.set_major_formatter(coma)
ax.annotate('«90% seguro»\n→ 72% de aciertos', xy=(0.9, 0.72), xytext=(0.62, 0.86),
            fontsize=8.6, color=ACENTO,
            arrowprops=dict(arrowstyle="->", color=ACENTO, lw=1.2))
ax.legend(fontsize=8.6, loc="lower right", frameon=False)
for s in ["top", "right"]:
    ax.spines[s].set_visible(False)
guardar(fig, "fig05_calibracion.png")

# ------------------------------------------------------------- fig06 umbrales
fig, ax = plt.subplots(figsize=(7.2, 3.4))
ax.set_xlim(0, 10); ax.set_ylim(-0.55, 4.2); ax.axis("off")
y0, h = 1.7, 0.95
ax.add_patch(FancyBboxPatch((0.5, y0), 2.6, h, boxstyle="square,pad=0", fc="#e8e6e1", ec=INK, lw=1.2))
ax.add_patch(FancyBboxPatch((3.1, y0), 3.4, h, boxstyle="square,pad=0", fc="#cfd9df", ec=INK, lw=1.2))
ax.add_patch(FancyBboxPatch((6.5, y0), 3.0, h, boxstyle="square,pad=0", fc="#b9c9d1", ec=INK, lw=1.2))
ax.text(1.8, y0 + h / 2, "NO TESTEAR\nNI TRATAR", ha="center", va="center", fontsize=9.2, fontweight="bold")
ax.text(4.8, y0 + h / 2, "TESTEAR", ha="center", va="center", fontsize=9.2, fontweight="bold")
ax.text(8.0, y0 + h / 2, "TRATAR", ha="center", va="center", fontsize=9.2, fontweight="bold")
ax.text(0.5, 1.28, "0%", fontsize=8.6, ha="center", color=GRIS)
ax.text(9.5, 1.28, "100%", fontsize=8.6, ha="center", color=GRIS)
ax.text(5.0, 0.95, "Probabilidad de la enfermedad →", ha="center", fontsize=9, color=GRIS)
for x, nombre in [(3.1, "umbral de test"), (6.5, "umbral de tratamiento")]:
    ax.plot([x, x], [y0 - 0.12, y0 + h + 0.32], color=ACENTO, lw=1.8)
    ax.text(x, y0 + h + 0.5, nombre, ha="center", fontsize=8.8, color=ACENTO)
ax.text(5.0, 3.65, "Los umbrales se desplazan: daño de omitir ← → riesgo de la intervención,\nrendimiento de las pruebas, urgencia, reversibilidad, preferencias",
        ha="center", fontsize=8.8, color=GRIS, style="italic")
flecha(ax, 6.5, 0.42, 5.4, 0.42, color=ACENTO, lw=1.4)
ax.text(5.95, -0.12, "si omitir es grave y tratar es seguro,\nel umbral de tratamiento baja",
        ha="center", fontsize=7.8, color=ACENTO, style="italic")
guardar(fig, "fig06_umbrales.png")

# ---------------------------------------------------------- fig07 frecuencias
fig, ax = plt.subplots(figsize=(7.2, 4.6))
ax.set_xlim(0, 10); ax.set_ylim(0, 6.4); ax.axis("off")
caja(ax, 3.9, 5.35, 2.2, 0.8, "1.000\npacientes", fc=CLARO, ec=INK, fs=9.5, bold=True)
caja(ax, 1.15, 3.55, 2.4, 0.85, "100 con la\nenfermedad", fc="white", ec=ACENTO2, fs=9, bold=True)
caja(ax, 6.45, 3.55, 2.4, 0.85, "900 sin la\nenfermedad", fc="white", ec=INK, fs=9, bold=True)
flecha(ax, 4.55, 5.3, 2.6, 4.47)
flecha(ax, 5.45, 5.3, 7.4, 4.47)
caja(ax, 0.3, 1.7, 1.95, 0.85, "90\npositivos", fc=ACENTO, ec="none", fs=9, bold=True, tc="white")
caja(ax, 2.45, 1.7, 1.95, 0.85, "10\nnegativos", fc=CLARO, ec=GRIS, fs=9)
caja(ax, 5.6, 1.7, 1.95, 0.85, "180\npositivos", fc=ACENTO, ec="none", fs=9, bold=True, tc="white")
caja(ax, 7.75, 1.7, 1.95, 0.85, "720\nnegativos", fc=CLARO, ec=GRIS, fs=9)
flecha(ax, 1.95, 3.5, 1.35, 2.62); flecha(ax, 2.75, 3.5, 3.35, 2.62)
flecha(ax, 7.25, 3.5, 6.65, 2.62); flecha(ax, 8.05, 3.5, 8.65, 2.62)
ax.text(2.35, 4.75, "prevalencia 10%", fontsize=8, color=GRIS, rotation=24, ha="center")
ax.text(1.0, 3.06, "sensibilidad 90%", fontsize=7.6, color=GRIS)
ax.text(7.9, 3.06, "especificidad 80%", fontsize=7.6, color=GRIS)
caja(ax, 1.65, 0.25, 6.7, 0.95, "", fc="white", ec=ACENTO, lw=1.5)
ax.text(5.0, 0.92, "De 270 positivos, sólo 90 tienen la enfermedad", ha="center",
        fontsize=9.6, fontweight="bold", color=ACENTO)
ax.text(5.0, 0.5, "probabilidad postest = 90 / (90 + 180) = 33%", ha="center", fontsize=9.2)
guardar(fig, "fig07_frecuencias.png")

# --------------------------------------------------------------- fig08 hii-d
fig, ax = plt.subplots(figsize=(7.4, 5.8))
ax.set_xlim(0, 10.6); ax.set_ylim(-1.3, 7.9); ax.axis("off")
pasos = [
    ("0. PREGUNTA OPERATIVA", "¿qué decisión concreta debe resolverse ahora?", CLARO, INK),
    ("H — HECHOS", "datos decisivos con fuente, fecha, tendencia y límites", "white", ACENTO2),
    ("I — INFERENCIAS", "representación principal y alternativas, con grado:\ndemostrado · altamente probable · probable ·\nposible · no demostrado", "white", ACENTO2),
    ("I — INCERTIDUMBRE", "qué puede estar equivocado; priorizada por consecuencias,\nno por tamaño", "white", ACENTO2),
    ("D — DECISIÓN", "por umbral y consecuencias:\n«aunque X no está demostrado, actúo porque…»\n+ criterio de reapertura", "white", ACENTO2),
]
y = 6.75
for i, (t, s, fc, ec) in enumerate(pasos):
    hh = 1.28 if i in (2, 4) else (1.0 if i == 3 else 0.82)
    caja(ax, 0.55, y - hh, 6.75, hh, "", fc=fc, ec=ec, lw=1.4)
    ax.text(0.9, y - 0.3, t, ha="left", fontsize=10.4, fontweight="bold",
            color=ACENTO2 if i else INK)
    ax.text(0.9, y - hh + (0.42 if hh > 1.2 else 0.3), s, ha="left", fontsize=8.2, color=INK, va="center", linespacing=1.3)
    if i < 4:
        flecha(ax, 3.7, y - hh - 0.02, 3.7, y - hh - 0.28)
    y -= hh + 0.32
flecha(ax, 7.5, 1.35, 7.5, 6.3, color=ACENTO, lw=1.8, rad=0.42)
ax.text(9.55, 3.85, "REEVALUACIÓN\nresultado pendiente,\nplazo, cambio que\nreabre, responsable",
        ha="center", va="center", fontsize=9.0, color=ACENTO)
ax.text(5.3, 7.5, "Hechos sin inferencia son inventario; inferencias sin incertidumbre, dogma;\nincertidumbre sin decisión, parálisis; decisión sin reevaluación, inercia.",
        ha="center", fontsize=8.8, style="italic", color=GRIS)
ax.text(5.3, -0.62, "Versión de sesenta segundos:  ¿Qué vi y qué me contaron? ·\n¿Qué creo y cuánto derecho tengo a creerlo? ·\n¿Qué daño importante podría producir si estoy equivocado? ·\n¿Qué hago y qué me haría cambiar antes del próximo control?",
        ha="center", va="center", fontsize=8.2, color=ACENTO2, linespacing=1.35)
guardar(fig, "fig08_hiid.png")

print("Figuras generadas en", OUT)

# ---------------------------------------------------------- fig09 saga ANDROMEDA
fig, ax = plt.subplots(figsize=(7.6, 3.6))
ax.set_xlim(0, 10.6); ax.set_ylim(0, 5.0); ax.axis("off")
ax.annotate("", xy=(10.1, 2.5), xytext=(0.3, 2.5),
            arrowprops=dict(arrowstyle="-|>", color=INK, lw=2.0))
hitos = [
    (1.2, "2019", "ANDROMEDA-SHOCK\n(JAMA)", "llene capilar vs. lactato:\n−8,5 pts de mortalidad,\np = 0,06 → «negativo»", ACENTO),
    (3.9, "2020", "Reanálisis bayesiano\n(AJRCCM)", "mismo dato, otro marco:\n>90% de probabilidad\nde beneficio", ACENTO2),
    (6.5, "2022–2025", "Refinamiento", "fenotipos hemodinámicos,\nalgoritmo personalizado:\nprueba más severa", GRIS),
    (9.3, "2025", "ANDROMEDA-SHOCK-2\n(JAMA)", "86 centros, 19 países:\nsuperior al cuidado\nhabitual", ACENTO),
]
for x, anio, titulo, detalle, color in hitos:
    ax.plot([x], [2.5], marker="o", ms=9, color=color, zorder=3)
    ax.text(x, 2.95, anio, ha="center", fontsize=10, fontweight="bold", color=color)
    ax.text(x, 3.85, titulo, ha="center", va="center", fontsize=8.6, fontweight="bold", color=INK)
    ax.text(x, 1.55, detalle, ha="center", va="center", fontsize=7.2, color="#4a4a4a")
ax.text(5.3, 4.75, "Un ensayo no se lee solo: el marco inferencial es parte de la lectura",
        ha="center", fontsize=9.2, style="italic", color=GRIS)
ax.text(5.3, 0.35, "«No significativo» no significó «sin efecto»: la hipótesis se refinó y se volvió a someter a prueba",
        ha="center", fontsize=8.6, style="italic", color=ACENTO)
guardar(fig, "fig09_andromeda.png")

# ======================================================================
# Figuras relacionales (edición de octubre de 2026): muestran relaciones
# entre capítulos que antes vivían en remisiones cruzadas.
# ======================================================================


def texto_caja(ax, x, y, w, h, titulo, cuerpo, fc="white", ec=INK, lw=1.2,
               fs_t=8.6, fs_c=7.2, tc_t=ACENTO2, tc_c=INK, align="center"):
    caja(ax, x, y, w, h, "", fc=fc, ec=ec, lw=lw)
    if titulo:
        ax.text(x + w / 2 if align == "center" else x + 0.18, y + h - 0.26, titulo,
                ha=align, va="center", fontsize=fs_t, fontweight="bold", color=tc_t)
    if cuerpo:
        yc = y + (h - 0.42) / 2 if titulo else y + h / 2
        ax.text(x + w / 2 if align == "center" else x + 0.18, yc, cuerpo,
                ha=align, va="center", fontsize=fs_c, color=tc_c, linespacing=1.25)


# --------------------------------------------------------- fig10 mapa del libro
fig, ax = plt.subplots(figsize=(8.2, 5.0))
ax.set_xlim(0, 11.4); ax.set_ylim(0, 6.9); ax.axis("off")
partes = [("PARTE I", "Las capas del\nconocimiento"), ("PARTE II", "La mente que\nse observa"),
          ("PARTE III", "Decidir en el tiempo\ny con otros"), ("PARTE IV", "Una epistemología\noperativa")]
hilos = [
    ("CAPAS\nH · I · I · D",
     ["1 el hecho y su\n   procedencia\n2 inferir · 3 incertidumbre\n4 el lenguaje que\n   las conserva",
      "7 el error como\n   trayectoria\n8 presentar sin\n   la etiqueta",
      "9 del ensayo al caso\n10 umbral · 11 trayectoria\n12 la ficha que piensa\n   (matriz HII-D)",
      "15 el método HII-D\nCuaderno de casos\nAp. A (hoja)\nAp. B (léxico)"]),
    ("ABDUCCIÓN →\nMETACOGNICIÓN →\nHUMILDAD",
     ["2 la conjetura que\n   crea explicaciones\n   (Peirce)",
      "5 monitoreo y control\n6 intuición y su entorno\n7–8 error y pausa\n   selectiva",
      "13 metacognición\n   de equipo\n   (cognición distribuida)",
      "14 humildad como motor\n16 enseñarla y\n   organizarla\n17 razonar antes\n   de consultar"]),
    ("LENGUAJE\ndensidad → léxico →\nfrase medular",
     ["4 densidad epistémica\n   actos de habla\n   Toulmin",
      "7 la frase heredada\n8 reformular sin\n   el diagnóstico",
      "11 «está mejor»\n12 el fósil narrativo\n13 transferir es\n   transformar",
      "15 frase medular\nAp. B léxico de certeza\n18 Parra, no Huidobro"]),
]
x0, wl, wc, gap = 0.25, 1.75, 2.2, 0.12
xs = [x0 + wl + gap + i * (wc + gap) for i in range(4)]
# cabecera
for (p, s), x in zip(partes, xs):
    caja(ax, x, 5.75, wc, 0.95, "", fc=ACENTO2, ec="none")
    ax.text(x + wc / 2, 6.44, p, ha="center", va="center", fontsize=8.8, fontweight="bold", color="white")
    ax.text(x + wc / 2, 6.03, s, ha="center", va="center", fontsize=7.0, color="white", linespacing=1.2)
# filas
y = 5.55
hs = [1.45, 1.45, 1.45]
for (nombre, celdas), h in zip(hilos, hs):
    y -= h + 0.12
    caja(ax, x0, y, wl, h, "", fc=CLARO, ec=INK, lw=1.1)
    ax.text(x0 + wl / 2, y + h / 2, nombre, ha="center", va="center", fontsize=7.6,
            fontweight="bold", color=ACENTO, linespacing=1.3)
    for c, x in zip(celdas, xs):
        caja(ax, x, y, wc, h, "", fc="white", ec=GRIS, lw=0.9)
        ax.text(x + 0.1, y + h / 2, c, ha="left", va="center", fontsize=6.3, color=INK, linespacing=1.25)
# hilo de Carmen
ancho_total = wl + gap + 4 * wc + 3 * gap
caja(ax, x0, 0.22, ancho_total, 0.55, "", fc=ACENTO, ec="none")
ax.patches[-1].set_alpha(0.12)
ax.text(x0 + ancho_total / 2, 0.5, "CARMEN atraviesa todo el libro:  Introducción → Interludio I (la ficha) → Interludio II (el equipo) → Interludio III (la decisión) → viñeta 1 (epílogo)",
        ha="center", va="center", fontsize=7.0, color=ACENTO, style="italic")
guardar(fig, "fig10_mapa_libro.png")

# ------------------------------------------------- fig11 Toulmin y frase medular
fig, ax = plt.subplots(figsize=(7.6, 5.0))
ax.set_xlim(0, 10.6); ax.set_ylim(0, 6.9); ax.axis("off")
texto_caja(ax, 0.3, 4.55, 3.3, 1.45, "DATO", "hemocultivos 2/2 con\nbacilos gramnegativos,\nen contexto de obstrucción\nmecánica por hernia incisional", ec=INK, lw=1.4)
texto_caja(ax, 7.0, 4.55, 3.3, 1.45, "CONCLUSIÓN", "la bacteriemia tiene\nfoco abdominal\n(translocación desde\nel asa atascada)", ec=INK, lw=1.4)
flecha(ax, 3.68, 5.27, 6.92, 5.27, lw=2.0)
ax.text(5.3, 5.62, "CALIFICADOR MODAL", ha="center", fontsize=7.6, fontweight="bold", color=ACENTO)
ax.text(5.3, 5.38, "«altamente probable»", ha="center", fontsize=8.4, style="italic", color=ACENTO)
texto_caja(ax, 3.65, 2.85, 3.3, 1.3, "GARANTÍA", "una obstrucción con sufrimiento\nde pared permite el paso de\nenterobacterias a la sangre", ec=ACENTO2)
flecha(ax, 6.75, 4.18, 6.75, 4.95, color=GRIS, lw=1.2, estilo="-")
texto_caja(ax, 3.65, 1.35, 3.3, 1.2, "RESPALDO", "fisiopatología de la translocación ·\nsecuencia temporal · E. coli en sangre ·\nsin foco urinario ni respiratorio", ec=GRIS, fs_c=6.8)
flecha(ax, 5.3, 2.58, 5.3, 2.82, color=GRIS, lw=1.2, estilo="-")
texto_caja(ax, 7.0, 2.85, 3.3, 1.3, "REFUTACIÓN", "«salvo hallazgo alternativo»:\nurocultivo positivo, foco en\nimagen, catéter infectado", ec=ACENTO)
flecha(ax, 10.1, 4.18, 10.1, 4.52, color=ACENTO, lw=1.2, estilo="-", ls=":")
# capas HII-D
for x, y, etq in [(0.3, 6.18, "H — hecho con procedencia"), (3.65, 4.3, "I — inferencia con su grado"),
                  (7.0, 4.3, "I — incertidumbre crítica")]:
    ax.text(x + 0.05, y, etq, ha="left", fontsize=7.4, fontweight="bold", color=ACENTO)
texto_caja(ax, 0.3, 0.22, 10.0, 0.85, "", "", fc=CLARO, ec=INK)
ax.text(0.5, 0.86, "D — lo que la garantía autoriza", ha="left", fontsize=7.4, fontweight="bold", color=ACENTO)
ax.text(5.3, 0.5, "completar antibióticos según foco probable · no operar de urgencia hoy ·\nreevaluar si urocultivo positivo, nuevo dolor o fiebre",
        ha="center", va="center", fontsize=7.0, color=INK, linespacing=1.25)
ax.text(1.95, 2.3, "La frase medular es este\nargumento comprimido:\n«bacteriemia por gramnegativos\nen contexto de obstrucción:\nfoco abdominal altamente\nprobable, salvo hallazgo\nalternativo en imagen»",
        ha="center", va="center", fontsize=7.0, style="italic", color=GRIS, linespacing=1.3)
ax.text(5.3, 6.6, "Anatomía de una afirmación clínica (Toulmin, 1958) y su correspondencia con las capas del libro",
        ha="center", fontsize=8.4, style="italic", color=GRIS)
guardar(fig, "fig11_toulmin.png")

# ------------------------------------------- fig12 trayectoria del error (cap. 7)
fig, ax = plt.subplots(figsize=(8.2, 4.4))
ax.set_xlim(0, 11.4); ax.set_ylim(0, 5.6); ax.axis("off")
ax.annotate("", xy=(11.1, 3.1), xytext=(0.2, 3.1), arrowprops=dict(arrowstyle="-|>", color=INK, lw=2.0))
estaciones = [
    (1.0, "1 · URGENCIAS", "«ITU a repetición»:\nfrase heredada que\nentra como hecho"),
    (3.1, "2 · UROCULTIVO", "positivo, sin disuria\nni dolor lumbar;\na los 82 años la\nbacteriuria ronda\nel 20%: confirma poco"),
    (5.2, "3 · EXAMEN", "abdomen palpado\npor trámite:\nla hipótesis ya\nestaba cerrada"),
    (7.3, "4 · 48 HORAS", "no responde:\n«los mayores tardan\nen prender» — la\nevolución se\nreinterpreta"),
    (9.4, "5 · SIN SALIDA", "ningún criterio\nescrito, ninguna\npregunta: el caso\nno tiene reapertura"),
]
for x, t, s in estaciones:
    ax.plot([x], [3.1], marker="o", ms=9, color=INK, zorder=3)
    ax.text(x, 3.5, t, ha="center", fontsize=7.6, fontweight="bold", color=ACENTO2)
    ax.text(x, 4.5, s, ha="center", va="center", fontsize=6.4, color=INK, linespacing=1.2)
ax.text(11.1, 2.55, "día 4:\ncolecistitis\ngangrenosa", ha="right", va="center", fontsize=7.0, fontweight="bold", color=ACENTO)
# barreras
for x, t in [(4.15, "BARRERA 1 · al indicar el antibiótico\ncriterio de reapertura escrito:\n«si no recupera basal ni apetito\nen 48 h, reexaminar abdomen»"),
             (7.3, "BARRERA 2 · en la visita de sala\npregunta de resistencia:\n«¿qué hallazgo no explica\nuna infección urinaria?»")]:
    ax.plot([x, x], [1.95, 3.05], color=ACENTO, lw=1.8, ls="--")
    ax.text(x, 1.15, t, ha="center", va="center", fontsize=6.4, color=ACENTO, linespacing=1.25)
ax.text(5.7, 5.35, "El sesgo («anclaje») está en la estación 1; el error es la trayectoria completa — y la corrección es una barrera, no una virtud",
        ha="center", fontsize=8.0, style="italic", color=GRIS)
ax.text(5.7, 0.2, "Reconstruir así es también el formato de una reunión de morbimortalidad útil (cap. 16, Ap. C)",
        ha="center", fontsize=7.4, style="italic", color=GRIS)
guardar(fig, "fig12_trayectoria_error.png")

# -------------------------------------- fig13 Carmen: el umbral que se mueve
fig, ax = plt.subplots(figsize=(7.8, 4.9))
ax.set_xlim(0, 10.8); ax.set_ylim(0, 6.4); ax.axis("off")
ax.annotate("", xy=(10.55, 5.0), xytext=(0.2, 5.0), arrowprops=dict(arrowstyle="-|>", color=INK, lw=2.0))
hitos = [
    (0.9, "MADRUGADA\n04:15", "shock, lactato 6,0;\nTAC sin isquemia", ACENTO),
    (3.0, "DÍA 1", "hemocultivos con\ngramnegativos;\n«¿95% seguros?»", GRIS),
    (5.1, "DÍA 3", "E. coli; sin vasoactivos;\nla ficha HII-D", GRIS),
    (7.2, "DÍA 7", "sin sonda, evaluación\npreoperatoria;\nla conversación", ACENTO),
    (9.4, "TRAS EL ALTA", "reparación\nprogramada", ACENTO2),
]
for x, t, s, c in hitos:
    ax.plot([x], [5.0], marker="o", ms=9, color=c, zorder=3)
    ax.text(x, 5.45, t, ha="center", va="center", fontsize=7.6, fontweight="bold", color=c)
    ax.text(x, 4.35, s, ha="center", va="center", fontsize=6.8, color=INK, linespacing=1.25)


def balanza(ax, x, titulo, a_t, a_h, b_t, b_h, veredicto):
    caja(ax, x, 0.3, 4.6, 3.45, "", fc="white", ec=INK, lw=1.1)
    ax.text(x + 2.3, 3.48, titulo, ha="center", fontsize=8.0, fontweight="bold", color=ACENTO2)
    base = 2.05
    for xb, t, h, c in [(x + 0.75, a_t, a_h, ACENTO), (x + 2.65, b_t, b_h, GRIS)]:
        ax.add_patch(FancyBboxPatch((xb, base), 1.3, h, boxstyle="square,pad=0", fc=c, ec="none", alpha=0.75))
        ax.text(xb + 0.65, base - 0.12, t, ha="center", va="top", fontsize=6.3, color=INK, linespacing=1.2)
    ax.plot([x + 0.5, x + 4.3], [base, base], color=GRIS, lw=0.8)
    ax.text(x + 0.42, base + 0.55, "daño\nesperado", ha="center", va="center", fontsize=5.6, color=GRIS, style="italic", rotation=90)
    ax.text(x + 2.3, 0.62, veredicto, ha="center", va="center", fontsize=6.4, fontweight="bold", color=ACENTO)


balanza(ax, 0.4, "Madrugada: ¿operar en shock?",
        "OPERAR AHORA\n(pabellón con la\npaciente inestable)", 1.15,
        "ESPERAR\n(SNG, antibióticos:\nel cuadro cede)", 0.4,
        "umbral de cirugía de rescate: alto → no se cruza")
balanza(ax, 5.8, "Día 7: ¿alta sin operar?",
        "ALTA SIN OPERAR\n(quinto atascamiento\nen casa, con shock)", 1.15,
        "OPERAR PROGRAMADA\n(riesgo perioperatorio\nmoderado)", 0.5,
        "umbral de reparación electiva: bajo → se opera")
ax.text(5.4, 6.2, "La anatomía radiológica es la misma en los dos momentos; lo que se desplaza es el costo del error de omisión",
        ha="center", fontsize=8.0, style="italic", color=GRIS)
guardar(fig, "fig13_carmen_umbral.png")

# ----------------------------------------------- fig14 el viaje de una frase
fig, ax = plt.subplots(figsize=(7.6, 4.3))
ax.set_xlim(0, 10.6); ax.set_ylim(0, 5.6); ax.axis("off")
etapas = [
    ("07:00 · nota de turno", "«neumonía\naspirativa»", "conjetura del residente,\ntras doce horas de turno", 0.10),
    ("entrega de turno", "«neumonía\naspirativa»", "se presenta como\ndiagnóstico", 0.28),
    ("visita · evolución", "«neumonía\naspirativa en\ntratamiento»", "la respuesta al\nantibiótico la confirma", 0.46),
    ("epicrisis", "«antecedente\nde neumonía\naspirativa»", "ya es parte\nde la ficha", 0.64),
    ("ingreso siguiente", "«antecedente\nde neumonía\naspirativa»", "escrito por quien nunca\nvio al paciente vomitar", 0.85),
]
w, gap, x = 1.86, 0.2, 0.25
for i, (t, frase, nota, a) in enumerate(etapas):
    caja(ax, x, 2.75, w, 1.55, "", fc=ACENTO2, ec="none")
    ax.patches[-1].set_alpha(a)
    ax.text(x + w / 2, 4.55, t, ha="center", fontsize=7.2, fontweight="bold", color=ACENTO2)
    ax.text(x + w / 2, 3.55, frase, ha="center", va="center", fontsize=7.4, fontweight="bold",
            color="white" if a > 0.4 else INK, linespacing=1.2)
    ax.text(x + w / 2, 2.3, nota, ha="center", va="center", fontsize=6.6, color=GRIS, linespacing=1.2)
    if i < 4:
        flecha(ax, x + w + 0.02, 3.52, x + w + gap - 0.02, 3.52, color=INK, lw=1.4)
    x += w + gap
ax.text(5.3, 5.3, "De conjetura a antecedente, y de antecedente a hecho: en ningún punto del trayecto alguien mintió",
        ha="center", fontsize=8.2, style="italic", color=GRIS)
ax.text(0.3, 1.8, "conjetura", ha="left", fontsize=7.4, color=ACENTO, style="italic")
ax.text(10.3, 1.8, "«hecho»", ha="right", fontsize=7.4, color=ACENTO, style="italic")
flecha(ax, 1.4, 1.85, 9.3, 1.85, color=ACENTO, lw=1.2)
# barra de Wang 2017
y0, hb = 0.55, 0.55
partes_w = [(0.18, "18%\nescrito a mano", INK), (0.46, "46% copiado de notas previas", ACENTO2), (0.36, "36% importado automáticamente", GRIS)]
xb = 0.3
for p, t, c in partes_w:
    ww = p * 10.0
    ax.add_patch(FancyBboxPatch((xb, y0), ww, hb, boxstyle="square,pad=0", fc=c, ec="white", lw=1.0, alpha=0.85))
    ax.text(xb + ww / 2, y0 + hb / 2, t, ha="center", va="center", fontsize=6.4, color="white", fontweight="bold", linespacing=1.1)
    xb += ww
ax.text(5.3, 0.25, "De qué está hecha una evolución típica: 23.630 notas hospitalarias con trazabilidad de cada carácter (Wang, Khanna & Najafi, 2017)",
        ha="center", va="center", fontsize=6.8, color=GRIS, style="italic")
guardar(fig, "fig14_viaje_frase.png")

# ---------------------------------------- fig15 parentescos IA ↔ sesgos del libro
fig, ax = plt.subplots(figsize=(7.8, 5.9))
ax.set_xlim(0, 10.8); ax.set_ylim(-0.35, 7.6); ax.axis("off")
pares = [
    ("Confabulación", "lo inventado, con la sintaxis de un hecho", "Certeza retórica", "la inferencia escrita como hecho (caps. 4 y 14)"),
    ("Sesgo de automatización", "aceptar la salida por venir de un sistema", "Anclaje + autoridad no interrogada", "la hipótesis que nadie contradice (caps. 7 y 13)"),
    ("Atrofia de la pericia", "menos adenomas sin la máquina", "Validez del entorno", "la intuición vive de práctica y feedback (cap. 6)"),
    ("Sesgo algorítmico", "gasto como sustituto de necesidad", "Carga teórica de la observación", "alguien decidió qué medir (cap. 1)"),
    ("Sobreconfianza no calibrada", "«estoy bastante seguro» como tono", "Confianza ≠ exactitud", "calibración y sensibilidad metacognitiva (cap. 5)"),
    ("Captura cognitiva", "la respuesta llega antes que el caso", "Cierre prematuro", "la primera hipótesis se queda con el caso (caps. 2 y 7)"),
    ("Degradación silenciosa", "el modelo decae sin avisar", "Experiencia sin feedback", "años que no se vuelven calibración (caps. 5 y 16)"),
]
ax.text(2.2, 7.25, "RIESGO DE LA IA CLÍNICA", ha="center", fontsize=9.4, fontweight="bold", color=ACENTO)
ax.text(8.0, 7.25, "SESGO QUE EL LIBRO YA DESCRIBIÓ", ha="center", fontsize=9.4, fontweight="bold", color=ACENTO2)
y = 6.75
for r_t, r_s, s_t, s_s in pares:
    caja(ax, 0.3, y - 0.8, 3.8, 0.8, "", fc="white", ec=ACENTO, lw=1.1)
    ax.text(0.45, y - 0.28, r_t, ha="left", fontsize=8.2, fontweight="bold", color=ACENTO)
    ax.text(0.45, y - 0.6, r_s, ha="left", fontsize=7.0, color=INK)
    caja(ax, 5.3, y - 0.8, 5.2, 0.8, "", fc="white", ec=ACENTO2, lw=1.1)
    ax.text(5.45, y - 0.28, s_t, ha="left", fontsize=8.2, fontweight="bold", color=ACENTO2)
    ax.text(5.45, y - 0.6, s_s, ha="left", fontsize=7.0, color=INK)
    flecha(ax, 4.15, y - 0.4, 5.25, y - 0.4, color=GRIS, lw=1.3, estilo="<|-|>")
    y -= 0.93
ax.text(5.4, -0.12, "Ningún riesgo es nuevo: la IA automatiza los errores que ya teníamos y les quita los frenos —\nla lentitud, la duda, el cansancio que obligaba a pedir ayuda",
        ha="center", va="center", fontsize=8.0, style="italic", color=GRIS, linespacing=1.25)
guardar(fig, "fig15_parentescos_ia.png")

print("Figuras generadas en", OUT)
