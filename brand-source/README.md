# Studio Super generated identity sources

The v2 primary wordmark and compact companion emblem were created with the built-in OpenAI image-generation model. The source PNGs preserve those generations on the original flat magenta removal background. The `*-cutout-v2-final.png` files are the reviewed transparent masters after chroma-key removal, soft matte, edge contraction, despill, and a final visible-key-pixel rejection check.

- `studio-super-wordmark-generated-v2.png`: untouched dark-surface wordmark generation spelling the full name `STUDIO SUPER`.
- `studio-super-wordmark-cutout-v2-final.png`: transparent dark-surface production master.
- `studio-super-wordmark-light-generated-v2.png`: image-model edit preserving the exact wordmark geometry for light interfaces.
- `studio-super-wordmark-light-cutout-v2-final.png`: transparent light-surface production master.
- `studio-super-mark-generated-v2.png`: untouched companion-emblem generation.
- `studio-super-mark-cutout-v2-final.png`: transparent emblem production master.

`scripts/build_brand_assets.py` performs only mechanical crop, scaling, alpha-noise cleanup, and icon plating. It does not draw, trace, reconstruct, or replace the image-model artwork.

Regenerate the shipping sizes with Pillow 11.3 or newer:

```powershell
python scripts/build_brand_assets.py
npm run build
npm run verify:brand
```
