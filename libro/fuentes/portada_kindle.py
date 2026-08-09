# Portada para Kindle/KDP: 1600x2560 px (razón 1.6:1), JPEG RGB.
# Identidad del interior: papel crema, tinta #2b2b2b, vino #8c2f2f, azul #3d5a6c.
# Motivo: las cuatro capas del conocimiento clínico + la franja de incertidumbre.
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle
from matplotlib import font_manager

PAPEL, INK, ACENTO, ACENTO2, GRIS = "#f4f0e8", "#2b2b2b", "#8c2f2f", "#3d5a6c", "#6b675f"
SERIF = "Liberation Serif"

W, H = 1600, 2560
fig = plt.figure(figsize=(W / 100, H / 100), dpi=100)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, W); ax.set_ylim(0, H); ax.axis("off")
ax.add_patch(Rectangle((0, 0), W, H, color=PAPEL, zorder=0))

# marco fino
m = 70
ax.add_patch(Rectangle((m, m), W - 2 * m, H - 2 * m, fill=False, ec=INK, lw=2.2, zorder=1))
ax.add_patch(Rectangle((m + 14, m + 14), W - 2 * (m + 14), H - 2 * (m + 14),
                       fill=False, ec=INK, lw=0.8, alpha=0.55, zorder=1))

def texto(x, y, s, size, color=INK, weight="normal", style="normal", spacing=None, ha="center"):
    if spacing:
        s = spacing.join(list(s))
    ax.text(x, y, s, ha=ha, va="center", fontsize=size, color=color,
            family=SERIF, fontweight=weight, style=style, zorder=5)

# ---- título ----
ty = H - 480
texto(W / 2, ty + 210, "HECHOS,", 100, weight="bold")
texto(W / 2, ty + 40, "INFERENCIAS", 100, weight="bold")
texto(W / 2, ty - 130, "E INCERTIDUMBRE", 100, weight="bold")

# filete + subtítulo
ax.plot([W / 2 - 330, W / 2 + 330], [ty - 265, ty - 265], color=ACENTO, lw=3, zorder=5)
texto(W / 2, ty - 360, "Metacognición, lenguaje", 56, color=ACENTO2, style="italic")
texto(W / 2, ty - 440, "y decisión clínica", 56, color=ACENTO2, style="italic")

# ---- motivo central: cuatro capas + franja de incertidumbre + reevaluación ----
labels = ["H", "I", "I", "D"]
bw, bh, gap = 240, 330, 62
total = 4 * bw + 3 * gap
x0 = (W - total) / 2
by = 810
for i, lab in enumerate(labels):
    x = x0 + i * (bw + gap)
    caja = FancyBboxPatch((x, by), bw, bh, boxstyle="round,pad=8,rounding_size=14",
                          fc="white", ec=INK, lw=3.0, zorder=3)
    ax.add_patch(caja)
    ax.text(x + bw / 2, by + bh / 2 + 12, lab, ha="center", va="center",
            fontsize=112, family=SERIF, fontweight="bold", color=ACENTO2, zorder=4)
    if i < 3:
        ax.annotate("", xy=(x + bw + gap - 8, by + bh / 2), xytext=(x + bw + 8, by + bh / 2),
                    arrowprops=dict(arrowstyle="-|>", lw=3.0, color=INK), zorder=4)

# franja de incertidumbre que atraviesa las cajas
band_h = 74
ax.add_patch(Rectangle((x0 - 60, by + 88), total + 120, band_h, fc=ACENTO, alpha=0.16,
                       ec="none", zorder=4))
# arco de reevaluación
ax.annotate("",
            xy=(x0 + bw / 2, by - 52), xytext=(x0 + 3 * (bw + gap) + bw / 2, by - 52),
            arrowprops=dict(arrowstyle="-|>", lw=3.4, color=ACENTO,
                            connectionstyle="arc3,rad=0.22"), zorder=4)
texto(W / 2, by - 210, "hechos · inferencias · incertidumbre · decisión", 40, color=GRIS, style="italic")

# ---- autor ----
texto(W / 2, 420, "DANIEL OPAZO", 62, spacing="  ")
ax.plot([W / 2 - 200, W / 2 + 200], [340, 340], color=ACENTO, lw=2, zorder=5)
texto(W / 2, 270, "Ensayo", 38, color=GRIS, style="italic")

fig.savefig("portada_kindle.jpg", dpi=100, pil_kwargs={"quality": 95})
fig.savefig("portada_kindle_preview.png", dpi=40)
print("portada 1600x2560 OK")
