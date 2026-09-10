#!/usr/bin/env python3
"""Recorta y amplía la zona del viewmodel (abajo-derecha) para análisis VLM."""
import sys
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else '/home/z/my-project/scripts/v9-verify-3-game.png'
dst = sys.argv[2] if len(sys.argv) > 2 else '/home/z/my-project/scripts/v9-crop-weapon.png'

img = Image.open(src)
w, h = img.size
# región del viewmodel: mitad derecha inferior, ampliado
box = (int(w * 0.45), int(h * 0.45), w, h)
crop = img.crop(box)
# escalar x2 para que el VLM vea detalle
crop = crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS)
crop.save(dst)
print(f"OK {dst} {crop.size}")
