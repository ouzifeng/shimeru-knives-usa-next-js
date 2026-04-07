import type { SupabaseClient } from "@supabase/supabase-js";
import type { WCImage } from "./types";

const BUCKET = "product-images";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "image",
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Site": "cross-site",
};

/** Ensure the storage bucket exists */
export async function ensureImageBucket(supabase: SupabaseClient) {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, { public: true });
  }
}

/** Check if an image already exists in storage. Returns the public URL if it does, null otherwise. */
async function getExistingImage(
  supabase: SupabaseClient,
  supabaseUrl: string,
  productId: number,
  imageId: number
): Promise<string | null> {
  // List files in the product folder and check if one matches this image ID
  const { data: files } = await supabase.storage.from(BUCKET).list(String(productId));
  if (!files?.length) return null;

  const match = files.find((f) => f.name.startsWith(`${imageId}.`));
  if (match) {
    return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${productId}/${match.name}`;
  }
  return null;
}

/** Download an image from a URL and upload it to Supabase Storage.
 *  Returns the public URL, or null on failure. */
async function uploadImage(
  supabase: SupabaseClient,
  supabaseUrl: string,
  productId: number,
  image: WCImage
): Promise<string | null> {
  try {
    const res = await fetch(image.src, { headers: BROWSER_HEADERS });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png"
      : contentType.includes("webp") ? "webp"
      : contentType.includes("gif") ? "gif"
      : "jpg";

    const path = `${productId}/${image.id}.${ext}`;
    const buffer = await res.arrayBuffer();

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error(`Failed to upload image ${path}:`, error.message);
      return null;
    }

    return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
  } catch (err) {
    console.error(`Failed to download image for product ${productId}:`, err);
    return null;
  }
}

/** Sync images for a batch of products. Skips images already in storage.
 *  Downloads from WC, uploads to Supabase Storage,
 *  and returns updated image arrays with Supabase URLs. */
export async function syncProductImages(
  supabase: SupabaseClient,
  supabaseUrl: string,
  products: { id: number; images: WCImage[] }[]
): Promise<Map<number, WCImage[]>> {
  const result = new Map<number, WCImage[]>();

  await Promise.all(
    products.map(async (product) => {
      const updatedImages: WCImage[] = [];

      for (const image of product.images) {
        // Check if already in storage — skip download if so
        const existing = await getExistingImage(supabase, supabaseUrl, product.id, image.id);
        if (existing) {
          updatedImages.push({ ...image, src: existing });
          continue;
        }

        const publicUrl = await uploadImage(supabase, supabaseUrl, product.id, image);
        updatedImages.push({
          ...image,
          src: publicUrl || image.src,
        });
      }

      result.set(product.id, updatedImages);
    })
  );

  return result;
}
