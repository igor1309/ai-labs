import { PICTURE_FRAME, type PictureCut, type PicturePiece, type Rectangle } from "./puzzle.ts";

export type PicturePoint = { x: number; y: number };

// Inside the board every shared edge belongs to the slot right or below.
// Forgiveness applies only beyond the board, never over another slot.
export function pictureDropFits(piece: PicturePiece, cut: PictureCut, board: Rectangle, point: PicturePoint): boolean {
  if (board.width <= 0 || board.height <= 0 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  const x = point.x - board.x;
  const y = point.y - board.y;
  if (x >= 0 && y >= 0 && x < board.width && y < board.height) {
    return Math.floor(x / (board.width / cut.columns)) === piece.column
      && Math.floor(y / (board.height / cut.rows)) === piece.row;
  }
  const left = piece.home.x / PICTURE_FRAME.width * board.width;
  const top = piece.home.y / PICTURE_FRAME.height * board.height;
  const right = left + piece.home.width / PICTURE_FRAME.width * board.width;
  const bottom = top + piece.home.height / PICTURE_FRAME.height * board.height;
  return x >= left - 24 && x <= right + 24 && y >= top - 24 && y <= bottom + 24;
}
