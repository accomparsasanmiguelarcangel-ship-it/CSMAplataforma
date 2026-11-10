import cairosvg, os
from PIL import Image, ImageDraw, ImageFilter

SRC = "/home/user/assets/logo-transparent.png"
OUT = "/home/user/asociacion-arcangel/public/icons"
os.makedirs(OUT, exist_ok=True)

GREEN = "#12351b"
GREEN_MID = "#1f5b2a"
YELLOW = "#ffb800"
ORANGE = "#ff5e00"

# ── Decoración instrumental dibujada como vector (no se toca el logo) ──────
DECOR = """<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<g fill="none" stroke="{stroke}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="{op}">
  <!-- Quena (flauta andina) arriba izquierda -->
  <g transform="translate(96,44) rotate(-14)">
    <rect x="0" y="0" width="26" height="150" rx="12"/>
    <circle cx="13" cy="34" r="5"/><circle cx="13" cy="66" r="5"/><circle cx="13" cy="98" r="5"/>
    <path d="M6 8h14"/>
  </g>
  <!-- Tinya (tambor) arriba derecha -->
  <g transform="translate(388,60)">
    <circle cx="0" cy="0" r="54"/>
    <circle cx="0" cy="0" r="34"/>
    <path d="M-54 0h-22M54 0h22M0 -54v-20M0 54v20"/>
    <path d="M-38 -38l-15 -15M38 38l15 15"/>
  </g>
  <!-- Guitarra abajo izquierda -->
  <g transform="translate(104,392) rotate(14)">
    <path d="M0 0c-30 0-52 24-52 52 0 22 14 34 14 52S-52 148-26 148 22 128 22 108 8 82 8 62 26 0 0 0z"/>
    <circle cx="-8" cy="92" r="17"/>
    <path d="M-8 8v40M2 8v40M12 8v40"/>
  </g>
  <!-- Quena corta / antara abajo derecha -->
  <g transform="translate(392,338) rotate(22)">
    <rect x="0" y="0" width="24" height="122" rx="11"/>
    <path d="M1 96h22M1 108h22"/>
  </g>
</g>
<!-- Marco textil andino -->
<g stroke="{stroke}" stroke-width="7" fill="none" opacity="{opFrame}">
  <path d="M256 18l40 34 44-14 14 44 34 40-34 40 14 44-44 14-40 34-40-34-44 14-14-44-34-40 34-40-14-44 44 14z"/>
</g>
</svg>"""


def round_mask(size, radius):
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=radius * 4, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def build(size, *, bg=True, frame=True, decor=True, pad_ratio=0.30, mask="rounded", radius_ratio=0.235):
    canvas = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))

    if bg:
        base = Image.new("RGBA", (size * 4, size * 4), GREEN)
        # degradado radial verde
        grad = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
        gd = ImageDraw.Draw(grad)
        gd.ellipse([-int(size * 1.4), -int(size * 1.6), int(size * 5.4), int(size * 4.2)],
                   fill=(31, 91, 42, 255))
        base = Image.alpha_composite(base, grad.filter(ImageFilter.GaussianBlur(size * 0.7)))
        canvas = base

    if decor or frame:
        svg = DECOR.format(
            stroke=YELLOW,
            op=0.55 if decor else 0.0,
            opFrame=0.42 if frame else 0.0,
        )
        layer = Image.open(
            __import__("io").BytesIO(cairosvg.svg2png(bytestring=svg.encode(), output_width=size * 4, output_height=size * 4))
        ).convert("RGBA")
        canvas = Image.alpha_composite(canvas, layer)

    # Logotipo ORIGINAL, sin redibujar: solo se escala y se centra
    logo = Image.open(SRC).convert("RGBA")
    target_w = int(size * 4 * (1 - pad_ratio))
    ratio = target_w / logo.width
    logo_r = logo.resize((target_w, int(logo.height * ratio)), Image.LANCZOS)
    lx = (size * 4 - logo_r.width) // 2
    ly = (size * 4 - logo_r.height) // 2

    shadow = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
    sh = Image.new("RGBA", logo_r.size, (0, 0, 0, 130))
    sh.putalpha(logo_r.split()[3].point(lambda a: int(a * 0.55)))
    shadow.paste(sh, (lx, ly + int(size * 0.03)), sh)
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(size * 0.06)))
    canvas.alpha_composite(logo_r, (lx, ly))

    out = canvas.resize((size, size), Image.LANCZOS)

    if mask == "rounded":
        out.putalpha(round_mask(size, radius_ratio * size))
    elif mask == "circle":
        m = Image.new("L", (size * 2, size * 2), 0)
        ImageDraw.Draw(m).ellipse([0, 0, size * 2 - 1, size * 2 - 1], fill=255)
        out.putalpha(m.resize((size, size), Image.LANCZOS))
    return out


def save(img, name):
    img.save(os.path.join(OUT, name), optimize=True)
    print("✓", name)


for s in (72, 96, 128, 144, 152, 192, 256, 384, 512):
    save(build(s), f"icon-{s}.png")

save(build(512, mask="none"), "icon-full-512.png")

# Maskable: logo más pequeño, fondo completo sin esquinas redondeadas (safe zone 80%)
for s in (192, 512):
    save(build(s, mask="none", pad_ratio=0.46, decor=False, frame=False), f"maskable-{s}.png")

# Apple touch (iOS aplica su propia máscara: fondo completo, sin transparencia)
save(build(180, mask="none", pad_ratio=0.34), "apple-touch-icon-180.png")
save(build(32, mask="rounded", pad_ratio=0.22, decor=False, frame=False), "favicon-32.png")

# Versión para pantalla de bienvenida / splash
save(build(1024, mask="none", pad_ratio=0.26), "splash-1024.png")

# Capturas para el manifest
for s, name in ((720, "screenshot-mobile.png"), (1280, "screenshot-wide.png")):
    w, h = (s, int(s * 1.6)) if s == 720 else (s, int(s * 0.5625))
    shot = Image.new("RGBA", (w, h), "#12351b")
    card = build(min(w, h) // 2, mask="none", pad_ratio=0.24)
    card = card.resize((int(min(w, h) * 0.62),) * 2, Image.LANCZOS)
    shot.alpha_composite(card, ((w - card.width) // 2, (h - card.height) // 2))
    save(shot.convert("RGB"), name)

# Logo social (og:image)
og = Image.new("RGBA", (1200, 630), "#12351b")
logo = Image.open(SRC).convert("RGBA")
lr = logo.resize((int(logo.width * 0.72), int(logo.height * 0.72)), Image.LANCZOS)
og.alpha_composite(lr, ((1200 - lr.width) // 2, (630 - lr.height) // 2))
save(og.convert("RGB"), "og-image.png")

print("Iconos generados en", OUT)
