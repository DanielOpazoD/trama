"""Genera las 8 figuras del libro en estilo editorial sobrio (grises + un acento)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import os

OUT = os.path.join(os.path.dirname(__file__), "figs")
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
w, h, gap, x0, y0 = 2.05, 1.9, 0.42, 0.25, 2.15
for i, (t, s) in enumerate(capas):
    x = x0 + i * (w + gap)
    caja(ax, x, y0, w, h, "", fc="white", ec=INK, lw=1.4)
    ax.text(x + w / 2, y0 + h - 0.42, t, ha="center", va="center", fontsize=10.5,
            fontweight="bold", color=ACENTO2)
    ax.text(x + w / 2, y0 + h / 2 - 0.28, s, ha="center", va="center", fontsize=8.6, color=INK)
    if i < 3:
        flecha(ax, x + w + 0.04, y0 + h / 2, x + w + gap - 0.04, y0 + h / 2)
# franja transversal: la incertidumbre no es sólo una etapa
caja(ax, 0.25, 1.28, 9.44, 0.5, "", fc=ACENTO, ec="none")
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
    ("Dato medido y verificable", "«Lactato 6,0 mmol/L (7:15, arterial)»", 0.92),
    ("Observación profesional reproducible", "«Relleno capilar 5 s, documentado por enfermería»", 0.74),
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
for i, o in enumerate(objetos):
    ax.text(1.55 + i * 2.35, 1.97, o, ha="center", va="center", fontsize=9.6, fontweight="bold")
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
ax.plot(conf, sobre, color=ACENTO, lw=2.2, marker="o", ms=5, label="Sobreconfianza (típica)")
ax.fill_between([0.5, 1.0], [0.5, 1.0], [0.35, 0.35], color=ACENTO, alpha=0.05)
ax.set_xlabel("Confianza declarada", fontsize=10)
ax.set_ylabel("Proporción real de aciertos", fontsize=10)
ax.set_xlim(0.48, 1.02); ax.set_ylim(0.35, 1.02)
ax.set_xticks([0.5, 0.6, 0.7, 0.8, 0.9, 1.0]); ax.set_yticks([0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0])
ax.tick_params(labelsize=8.5)
ax.annotate('"90% seguro"\n→ 72% de aciertos', xy=(0.9, 0.72), xytext=(0.62, 0.86),
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
ax.set_xlim(0, 10.6); ax.set_ylim(-0.5, 7.9); ax.axis("off")
pasos = [
    ("0. PREGUNTA OPERATIVA", "¿qué decisión concreta debe resolverse ahora?", CLARO, INK),
    ("H — HECHOS", "datos decisivos con fuente, fecha, tendencia y límites", "white", ACENTO2),
    ("I — INFERENCIAS", "representación principal y alternativas, con grado:\ndemostrado · altamente probable · probable · posible · no sustentado", "white", ACENTO2),
    ("I — INCERTIDUMBRE", "qué puede estar equivocado; priorizada por consecuencias,\nno por tamaño", "white", ACENTO2),
    ("D — DECISIÓN", "por umbral y consecuencias: «aunque X no está demostrado,\nactúo porque…» + criterio de reapertura", "white", ACENTO2),
]
y = 6.75
for i, (t, s, fc, ec) in enumerate(pasos):
    hh = 1.0 if i in (2, 3, 4) else 0.82
    caja(ax, 0.55, y - hh, 6.3, hh, "", fc=fc, ec=ec, lw=1.4)
    ax.text(0.9, y - 0.3, t, ha="left", fontsize=9.6, fontweight="bold",
            color=ACENTO2 if i else INK)
    ax.text(0.9, y - hh + 0.3, s, ha="left", fontsize=7.4, color=INK, va="center")
    if i < 4:
        flecha(ax, 3.7, y - hh - 0.02, 3.7, y - hh - 0.28)
    y -= hh + 0.32
flecha(ax, 7.05, 1.35, 7.05, 6.3, color=ACENTO, lw=1.8, rad=0.42)
ax.text(9.35, 3.85, "REEVALUACIÓN\nresultado pendiente,\nplazo, cambio que\nreabre, responsable",
        ha="center", va="center", fontsize=8.2, color=ACENTO)
ax.text(5.3, 7.5, "Hechos sin inferencia son inventario; inferencias sin incertidumbre, dogma;\nincertidumbre sin decisión, parálisis; decisión sin reevaluación, inercia.",
        ha="center", fontsize=8.8, style="italic", color=GRIS)
ax.text(5.3, -0.15, "Versión de 60 segundos:  ¿qué vi? · ¿qué creo y con qué derecho? ·\n¿qué dañaría al paciente si me equivoco? · ¿qué me haría cambiar?",
        ha="center", fontsize=8.8, color=ACENTO2)
guardar(fig, "fig08_hiid.png")

print("Figuras generadas en", OUT)

# ---------------------------------------------------------- fig09 saga ANDROMEDA
fig, ax = plt.subplots(figsize=(7.6, 3.6))
ax.set_xlim(0, 10.6); ax.set_ylim(0, 5.0); ax.axis("off")
ax.annotate("", xy=(10.1, 2.5), xytext=(0.3, 2.5),
            arrowprops=dict(arrowstyle="-|>", color=INK, lw=2.0))
hitos = [
    (1.2, "2019", "ANDROMEDA-SHOCK\n(JAMA)", "relleno capilar vs. lactato:\n−8,5 pts de mortalidad,\np = 0,06 → \"negativo\"", ACENTO),
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
ax.text(5.3, 0.35, "\"No significativo\" no significó \"sin efecto\": la hipótesis se refinó y se volvió a someter a prueba",
        ha="center", fontsize=8.6, style="italic", color=ACENTO)
guardar(fig, "fig09_andromeda.png")
