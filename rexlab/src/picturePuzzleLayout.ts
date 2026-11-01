// The tray takes 224px and its gap 24px. The board fills the remaining
// room at 4:3; the tray needs 360px for four targets and its controls.
export function pictureBoardLayout(room: { width: number; height: number }, cut: { columns: number; rows: number }) {
  const width = Math.max(0, Math.min(room.width - 248, room.height * 4 / 3));
  const height = width * 3 / 4;
  return { width, height, fits: width / cut.columns >= 48 && height / cut.rows >= 48 && room.height >= 360 };
}
