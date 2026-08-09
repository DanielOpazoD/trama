"""Dos portadas para el test A/B: idénticas salvo título/subtítulo."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import os

OUT = os.path.dirname(os.path.abspath(__file__))
CREMA = "#f5f2ec"
INK = "#26251f"
ACENTO = "#8c2f2f"
PIZARRA = "#3d5a6c"


def portada(nombre, titulo_lineas, tam_titulo, subtitulo_lineas):
    fig = plt.figure(figsize=(6, 9), dpi=200)
    fig.patch.set_facecolor(CREMA)
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 6); ax.set_ylim(0, 9); ax.axis("off")
    ax.set_facecolor(CREMA)

    # banda superior fina + sello editorial ficticio abajo
    ax.plot([0.7, 5.3], [8.15, 8.15], color=ACENTO, lw=2.2)
    ax.text(3.0, 8.38, "ENSAYO · MEDICINA", ha="center", fontsize=8.5,
            color=PIZARRA, family="DejaVu Sans", fontweight="bold")

    # título
    y = 6.9
    for linea in titulo_lineas:
        ax.text(3.0, y, linea, ha="center", va="center", fontsize=tam_titulo,
                color=INK, family="DejaVu Serif", fontweight="bold")
        y -= tam_titulo / 42
    # subtítulo
    y -= 0.28
    for linea in subtitulo_lineas:
        ax.text(3.0, y, linea, ha="center", va="center", fontsize=11.5,
                color=PIZARRA, family="DejaVu Serif", style="italic")
        y -= 0.34

    # motivo gráfico: cuatro capas (idéntico en ambas)
    yy = 3.55
    for i, alpha in enumerate([0.9, 0.65, 0.4, 0.2]):
        ax.add_patch(plt.Rectangle((2.1 + i * 0.12, yy - i * 0.34), 1.8 - i * 0.24, 0.2,
                                   fc=ACENTO, ec="none", alpha=alpha))
    ax.plot([0.7, 5.3], [2.1, 2.1], color=INK, lw=1.0)
    ax.text(3.0, 1.72, "DANIEL OPAZO", ha="center", fontsize=15, color=INK,
            family="DejaVu Serif", fontweight="bold")
    ax.text(3.0, 1.35, "Prólogo de [—]", ha="center", fontsize=9, color=PIZARRA,
            family="DejaVu Serif", style="italic")
    fig.savefig(os.path.join(OUT, nombre), facecolor=CREMA, bbox_inches=None)
    plt.close(fig)
    print("ok", nombre)


portada("portada_A.png",
        ["HECHOS,", "INFERENCIAS E", "INCERTIDUMBRE"], 24,
        ["Metacognición, lenguaje", "y decisión clínica"])

portada("portada_B.png",
        ["MEDICINA", "LÚCIDA"], 34,
        ["Hechos, inferencias e incertidumbre", "en la decisión clínica"])
