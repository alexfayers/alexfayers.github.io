# mycode.rocks

One static page. GitHub Actions rebuilds it every morning.

- `site.toml`: everything hand-written (blurb, strapline, links, music, `exclude`).
- `build.py`: reads `site.toml` and the public GitHub API, writes `_site/index.html`. Standard library only.
- `template.html`: the page. One line of inline JavaScript picks the print run. Frog and fonts are inlined.
- `player.js`: the play and next buttons. No outside requests are made until one is pressed, then one hidden YouTube player loads a random track from `[[tracks]]` in `site.toml`.
- `fonts/`: Archivo (OFL), from @fontsource-variable/archivo. Bebas Neue (OFL), from @fontsource/bebas-neue.

```sh
python3 build.py            # build from live data
python3 build.py --dump d.json && python3 build.py --fixture d.json   # save, then rebuild offline
```

Only repos that are public, not forks, not archived and not in `exclude` can appear.

GitHub pauses scheduled workflows after 60 days without a push to the repo; re-enable from the Actions tab if that happens.
