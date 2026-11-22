# Credits

All art in `assets/kenney/` is derived from CC0 1.0 Universal (public domain) packs by
**Kenney** ([kenney.nl](https://kenney.nl)).

## Source packs

| Pack | Author | License | Source |
| --- | --- | --- | --- |
| Pixel Platformer | Kenney | CC0 1.0 | https://kenney.nl/assets/pixel-platformer |
| Pixel Platformer Blocks | Kenney | CC0 1.0 | https://kenney.nl/assets/pixel-platformer-blocks |
| Platformer Pack Redux (360 assets) | Kenney | CC0 1.0 | https://opengameart.org/content/platformer-pack-redux-360-assets |

License text: https://creativecommons.org/publicdomain/zero/1.0/

## How these files were produced

`tiles.png`, `sprites.png`, `sprites.json` and `bg/*.png` are baked from the packs above by
the **pip-quest** CC0 asset pipeline (`scripts/fetch-assets.ts`): tiles are cropped to an
18px grid, sprite frames are trimmed/packed into a Phaser JSON atlas, and the eight
parallax backdrops are composed from the Kenney background tiles plus gradient skies.
`manifest.json` describes the baked layout (tile gid map, atlas frame regions and
background list).

No audio or fonts are included in this directory.
