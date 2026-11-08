// The board at 4:3 in its pocket, whose rim takes 12px a side, and the tools'
// pocket 24px past the rim: beside the board in a wide room, 308px wide or
// 248px on a phone on its side; under it in an upright room, as wide as the
// pocket and 216px tall, or 232px on a phone, whose controls stack. It fits
// where every place is at least 48px and the tools keep their targets.
export const PICTURE_RIM = 12;
export const PICTURE_GAP = 36;

export function pictureBoardLayout(room: { width: number; height: number }, cut: { columns: number; rows: number }) {
  const upright = room.height > room.width;
  const tools = upright ? (room.width >= 600 ? 216 : 232) : (room.width >= 900 ? 308 : 248);
  const width = Math.max(0, upright
    ? Math.min(room.width - 2 * PICTURE_RIM, (room.height - 2 * PICTURE_RIM - tools - PICTURE_GAP) * 4 / 3)
    : Math.min(room.width - 2 * PICTURE_RIM - tools - PICTURE_GAP, (room.height - 2 * PICTURE_RIM) * 4 / 3));
  const height = width * 3 / 4;
  const room4 = upright ? room.width >= 300 : room.height >= 280;
  return { width, height, upright, tools, fits: width / cut.columns >= 48 && height / cut.rows >= 48 && room4 };
}
