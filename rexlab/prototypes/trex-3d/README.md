# 3D T-Rex prototypes

Two experiments in showing the app's T-Rex in 3D with plain WebGL, no
Three.js. Neither is in the app; both are kept for testing and comparison.
Each page shows the 2D picture (`src/assets/dinos/tyrannosaurus/body.webp`)
beside the 3D one. Drag to turn it; left alone, it sways around the
picture's view.

| Page | How it is made | Verdict |
|---|---|---|
| `index.html` + `trex.glb` | Modelled in Blender by `build.py`: a skeleton of points with radii, skinned and smoothed, plus eyes, teeth and claws, in the picture's colours. | Real volume from every side. Looks like a toy, not like the picture: smaller head, no scales or outline, a crease at the hip. |
| `inflated.html` | The picture itself, inflated in the browser: the alpha gives the silhouette, the distance to its edge gives a round thickness, and the picture is the texture on both faces. | Right from the picture's view. Turned, the back is the front mirrored, so it shows two pairs of front legs. |

A faithful model needs hand sculpting, or an image-to-3D pipeline such as
[image-to-sculpt](https://github.com/gokayfem/image-to-sculpt), which needs
a paid fal key.

## Run

From `rexlab/`, run `npm run dev` and open
`http://localhost:5173/prototypes/trex-3d/index.html` or `.../inflated.html`.

## Rebuild the Blender model

Needs Blender 5.2+ (`brew install --cask blender`). From this folder:

```sh
blender -b --factory-startup --python build.py -- "$PWD/trex.glb" /tmp/trex-blender.png
```

The second path is optional and renders a preview still. Shape is set by the
`add(x, y, z, radius)` skeleton in `build.py`; colours by `body_colour`.

## Screenshots

With the dev server on port 5199 (`npx vite --port 5199`), from `rexlab/`:
`node prototypes/trex-3d/shots.cjs /tmp/trex-shots`. It takes each page at
the picture's view and turned, and fails on a page error. Chromium needs the
sandbox off on macOS.
