# rawadfahd.com

My portfolio. A plain 2D page with my projects, plus a first-person 3D version of my room you can walk around in.

## Running it

It's a static site, no build step. Serve the folder with anything:

```bash
python3 -m http.server 8000
```

and open `http://localhost:8000`. (Opening `index.html` straight from disk won't load the 3D room, because browsers block ES modules on `file://`.)

## Layout

```
index.html, styles.css, script.js   the 2D site
room/                                the 3D room (only downloaded when you open it)
  room.js           camera, first-person controls, clicking things, the side panels
  world.js          everything in the room, built from primitives
  textures.js       canvas-drawn textures (monitor, posters, corkboard, sky...)
  toon.js           cel shading + the ink outline pass
  custom-models.js  loads Blender exports listed in assets/models/manifest.json
  data.js           project / game text shown in the room
assets/games/       Roblox game icons
assets/models/      drop .glb files here (see below)
```

The project list lives in two places: `index.html` for the 2D page and `room/data.js` for the room. Update both when adding a project.

## The 3D room

- Opens from the **3D room** button or `#room` in the URL.
- Drag to look around. Walk with WASD, or click/tap the floor.
- Click things: the computer (projects), the books on the shelf (one per project), the Roblox figure on the desk (PseudonameGames), the corkboard (about), the phone (contact), the window (day/night), the lamp, the cube, the cat. The door takes you back to the 2D site.
- Built with three.js 0.185.1 from jsDelivr (pinned in the import map in `index.html`).

### Using your own models

Everything in the room is generated in code, but any piece can be swapped for a model from Blender:

1. In Blender, export as **glTF Binary (.glb)**, with "+Y Up" on and transforms applied. Units are metres; the desk top is 0.77 m off the floor.
2. Put the file in `assets/models/`.
3. Add it to `assets/models/manifest.json`:

```json
{
    "models": [
        { "file": "chair.glb", "replace": "chair" },
        { "file": "lamp.glb", "replace": "lamp", "scale": 0.9 },
        { "file": "guitar.glb", "position": [2.3, 0, 1.6], "rotation": [0, -90, 0] }
    ]
}
```

- `replace` hides one of the built-in objects and puts your model where it was. It also keeps that object's click behaviour. Names you can replace: `desk`, `chair`, `monitor`, `keyboard`, `lamp`, `mug`, `phone`, `bookstack`, `rubiks`, `roblox`, `shelf`, `bed`, `cat`, `plant`, `corkboard`, `cabinet`, `beanbag`, `wardrobe`, `console`, `door`, `calendar`, `pennant`, `poster-hello`, `poster-blocks`, `poster-engine`.
- `position` (metres) and `rotation` (degrees) override the placement. Without `replace`, the model goes in at `position`.
- Materials are converted to the same cel shading as the rest of the room. Set `"toon": false` to keep the originals.
- Keep files small (a couple of MB at most). Low-poly models with flat colours fit the look best.

## Contact

- rfahd15@gmail.com
- [GitHub](https://github.com/rfahd1525)
- [LinkedIn](https://www.linkedin.com/in/rawad-fahd-03b326196)
