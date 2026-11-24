import { api } from './api'
import { loadMeals } from './meals.svelte'

/** Longest side after resizing: plenty for a phone screen, ~200 KB as JPEG. */
const MAX_SIDE = 1600

/** Resize a picked photo on the phone and re-encode as JPEG, so uploads stay small. */
export async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
  if (!blob) throw new Error('Could not read that photo')
  return blob
}

export async function addPhoto(dishId: string, entryId: string | null, file: File): Promise<void> {
  await api.uploadPhoto(dishId, entryId, await toJpeg(file))
  await loadMeals(true)
}

export async function removePhoto(id: string): Promise<void> {
  await api.deletePhoto(id)
  urls.delete(id)
  await loadMeals(true)
}

// Photos need the sign-in token, so they're fetched as blobs and shown via object URLs.
const urls = new Map<string, Promise<string>>()
export function photoUrl(id: string): Promise<string> {
  let url = urls.get(id)
  if (!url) {
    url = api.photo(id).then((blob) => URL.createObjectURL(blob))
    url.catch(() => urls.delete(id))
    urls.set(id, url)
  }
  return url
}
