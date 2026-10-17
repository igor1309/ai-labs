// What loading a picture takes from the browser: an image that fetches its
// source and decodes it.
export type DecodingImage = { src: string; decode(): Promise<void> };

// Loads and decodes each picture before it is shown, so it appears whole
// rather than popping in. A picture that fails is done all the same: the
// card shows without it rather than the round stopping.
export function decodedPictures(newImage: () => DecodingImage): (url: string, done: () => void) => void {
  return (url, done) => {
    const image = newImage();
    image.src = url;
    image.decode().then(done, done);
  };
}
