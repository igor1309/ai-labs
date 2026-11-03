import type { HomeGame } from "./HomePage.tsx";
import pairsPicture from "./assets/home/pairs-triceratops.webp";
import digPicture from "./assets/home/dig-therizinosaurus.webp";
import colorPage from "./assets/home/color-mosasaurus.webp";
import careTilePicture from "./assets/home/tile-care.webp";
import colorTilePicture from "./assets/home/tile-color.webp";
import digTilePicture from "./assets/home/tile-dig.webp";
import drawTilePicture from "./assets/home/tile-draw.webp";
import mazeTilePicture from "./assets/home/tile-maze.webp";
import puzzleTilePicture from "./assets/home/tile-puzzle.webp";
import sortTilePicture from "./assets/home/tile-sort.webp";
import teethTilePicture from "./assets/home/tile-teeth.webp";

// Home's art, in one place: a theme or a new design swaps files here only.
export const PAIRS_PICTURE = pairsPicture;
export const DIG_PICTURE = digPicture;
export const COLOR_PAGE = colorPage;

// The tiles that show their game being played; each game's sky keeps its own picture.
export const HOME_TILE_PICTURES: Partial<Record<HomeGame, string>> = {
  care: careTilePicture,
  coloring: colorTilePicture,
  dig: digTilePicture,
  sandWriting: drawTilePicture,
  labyrinth: mazeTilePicture,
  picturePuzzle: puzzleTilePicture,
  sort: sortTilePicture,
  whoseJaw: teethTilePicture
};
