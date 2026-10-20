export type BasketRoom = {
  width: number;
  height: number;
  count: number;
  gap: number;
  nameWidth: number;
  nameHeight: number;
  pictureAspect: number;
  // Padding on each side of the art when names show; pictures alone have none.
  picturePadding: number;
};

export type BasketLayout = { columns: number; namesShown: boolean };

// All pictures have the same aspect, so maximising their height also
// maximises their area. Prefer fewer columns when pictures are equally large.
export function basketLayout({ width, height, count, gap, nameWidth, nameHeight, pictureAspect, picturePadding }: BasketRoom): BasketLayout {
  let named: { columns: number; picture: number } | undefined;
  let alone = { columns: 1, picture: -1 };
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const cardWidth = (width - gap * (columns - 1)) / columns;
    const cardHeight = (height - gap * (rows - 1)) / rows;
    if (cardWidth <= 0 || cardHeight <= 0) continue;

    const picture = Math.min(cardWidth / pictureAspect, cardHeight);
    if (picture > alone.picture) alone = { columns, picture };

    const namedPicture = Math.min((cardWidth - 2 * picturePadding) / pictureAspect, cardHeight - nameHeight - 2 * picturePadding);
    if (cardWidth >= nameWidth && namedPicture >= 48 && (!named || namedPicture > named.picture)) {
      named = { columns, picture: namedPicture };
    }
  }
  return { columns: named?.columns ?? alone.columns, namesShown: named !== undefined };
}
