export type PhotoCrop = { zoom: number; x: number; y: number };
export const centeredPhoto: PhotoCrop = { zoom: 1, x: 50, y: 50 };

export function cropSquare(width: number, height: number, crop: PhotoCrop) {
  const size = Math.min(width, height) / crop.zoom;
  return { size, left: (width - size) * crop.x / 100, top: (height - size) * crop.y / 100 };
}

export async function openPhoto(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP image.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > 24_000_000) throw new Error("Choose a photo smaller than 24 megapixels.");
    return image;
  } catch (error) {
    throw error instanceof Error && error.message.includes("megapixels") ? error : new Error("This photo couldn’t be opened. Try a different image.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function drawPhoto(canvas: HTMLCanvasElement, image: HTMLImageElement, crop: PhotoCrop) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser couldn’t prepare the photo.");
  const { size, left, top } = cropSquare(image.naturalWidth, image.naturalHeight, crop);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, left, top, size, size, 0, 0, canvas.width, canvas.height);
}

export function exportPhoto(image: HTMLImageElement, crop: PhotoCrop) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  drawPhoto(canvas, image, crop);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("This photo couldn’t be prepared. Try another.")), "image/webp", .9);
  });
}
