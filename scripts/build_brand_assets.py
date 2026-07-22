#!/usr/bin/env python3
"""Mechanically package the approved image-model masters into shipping PNG sizes."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "brand-source"
OUTPUT = ROOT / "public" / "brand"
RESAMPLING = Image.Resampling.LANCZOS
OBSIDIAN = (11, 11, 10, 255)
PLATE_LINE = (55, 51, 45, 255)


def load_rgba(name: str) -> Image.Image:
    with Image.open(SOURCE / name) as source:
        image = source.convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"{name} has no visible artwork")
    return image.crop(bbox)


def clean_resampling_noise(image: Image.Image) -> Image.Image:
    pixels = []
    for red, green, blue, alpha in image.getdata():
        key_colored = red > 220 and blue > 220 and green < 80
        pixels.append((0, 0, 0, 0) if alpha <= 8 or key_colored else (red, green, blue, alpha))
    image.putdata(pixels)
    return image


def contain(source: Image.Image, width: int, height: int, coverage: float) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    scale = min((width * coverage) / source.width, (height * coverage) / source.height)
    target = source.resize(
        (max(1, round(source.width * scale)), max(1, round(source.height * scale))),
        RESAMPLING,
    )
    canvas.alpha_composite(target, ((width - target.width) // 2, (height - target.height) // 2))
    return clean_resampling_noise(canvas)


def plated_mark(source: Image.Image, size: int) -> Image.Image:
    supersample = 4
    high_size = size * supersample
    high = Image.new("RGBA", (high_size, high_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(high)
    inset = max(supersample, round(high_size * 0.025))
    draw.rounded_rectangle(
        (inset, inset, high_size - inset - 1, high_size - inset - 1),
        radius=round(high_size * 0.22),
        fill=OBSIDIAN,
        outline=PLATE_LINE,
        width=max(supersample, round(high_size * 0.008)),
    )
    plate = high.resize((size, size), RESAMPLING)
    mark = contain(source, size, size, 0.64 if size >= 128 else 0.7)
    plate.alpha_composite(mark)
    return clean_resampling_noise(plate)


def save_png(image: Image.Image, name: str, *, rgb: bool = False) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT / name
    encoded = image.convert("RGB") if rgb else image
    encoded.save(destination, format="PNG", optimize=False, compress_level=9)
    print(f"wrote {destination.relative_to(ROOT).as_posix()}")


def main() -> None:
    dark_wordmark = load_rgba("studio-super-wordmark-cutout-v2-final.png")
    light_wordmark = load_rgba("studio-super-wordmark-light-cutout-v2-final.png")
    mark = load_rgba("studio-super-mark-cutout-v2-final.png")

    save_png(contain(dark_wordmark, 869, 275, 0.92), "studio-super-wordmark.png")
    save_png(contain(light_wordmark, 869, 275, 0.92), "studio-super-wordmark-light.png")
    for size in (16, 32, 64, 180, 512, 1024):
        save_png(plated_mark(mark, size), f"studio-super-mark-{size}.png")
    save_png(plated_mark(mark, 1024), "studio-super-mark-ios-1024.png", rgb=True)


if __name__ == "__main__":
    main()
