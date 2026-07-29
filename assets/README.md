# Brand assets

## For a submission upload

| File | Use |
|---|---|
| `png/logo-512.png` | Square app icon. Transparent background, works anywhere. |
| `png/logo-1024.png` | Same, larger. Use if the form wants ≥1000px. |
| `png/wordmark-on-dark-1200.png` | Horizontal banner for a dark page. |
| `png/wordmark-on-light-1200.png` | Horizontal banner for a light page. |

If the form only takes one image, use **`png/logo-512.png`**.

## Sources

`logo.svg` is the master: a shield (escrow — funds held) with a delta cut out of
it (Δ — the measured balance change that decides settlement). The delta is a
real `fill-rule` hole rather than a filled shape, so the mark reads on any
background and survives down to 16px.

The wordmark ships in two colourways because the master uses `currentColor` for
text, which resolves to black when an SVG is rendered standalone — light text on
a light background, i.e. invisible. The `-dark-bg` / `-light-bg` files carry
explicit text colours and a baked background rect.

`frontend/public/favicon.svg` is the same mark, flat single colour, which holds
up better than a gradient at favicon size.

## Regenerating the PNGs

```bash
npx sharp-cli -i assets/logo.svg -o assets/png/logo-512.png resize 512 512
npx sharp-cli -i assets/logo-wordmark-dark-bg.svg \
  -o assets/png/wordmark-on-dark-1200.png resize 1200 320
```
