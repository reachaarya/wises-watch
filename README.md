# Wise · Fine Timepieces

A scroll-driven storytelling site for The FlyBoy watch.

The site uses Three.js for the 3D watch, GSAP with ScrollTrigger and SplitText for animation, and Lenis for smooth scrolling.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production files in dist/
npm run preview    # serve dist/ locally
```

Upload `dist/` to any static host, such as Netlify, Vercel, Cloudflare Pages or Shopify.

## Where to edit

| What | File |
|---|---|
| Watches in the catalogue (names, prices, photos, links) | `src/collection.js` |
| Headlines, chapter text, specs, shipping/warranty copy | `index.html` (look for `TODO`) |
| Colours and fonts | top of `src/styles.css` (`:root`) |
| How the watch moves on scroll | `buildScroll()` in `src/main.js` |
| How each part flies apart | `EXPLODE` in `src/watch.js` |

Put product photos in `public/watches/` and set `image: '/watches/name.jpg'` in `src/collection.js`.

## The 3D model

`public/models/watch.glb` is generated from `../rolex-datejust/source/rolex_datejust.glb` by `npm run optimize-model` (`tools/process-datejust.mjs`).

The script does four things:

- It re-orients the model so the dial faces the viewer with 12 o'clock up, and scales it to the size the camera expects.
- It groups the parts into crystal, bezel, the three hands, dial, case, crown, caseback and the two bracelet halves.
- It splits the one-piece bracelet into top and bottom halves so they can separate in the exploded view.
- It resizes textures to 1024 px WebP and compresses the geometry with Draco.

The file goes from 9.4 MB to 1.4 MB.

The previous FlyBoy pipeline is kept in `tools/flyboy/`.

To check the scroll story in a real browser, run `node tools/shoot.mjs <outdir> 1440 900` while the dev server runs on port 5199.
