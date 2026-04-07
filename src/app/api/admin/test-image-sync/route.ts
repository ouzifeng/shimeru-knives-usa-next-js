import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProducts } from "@/lib/woocommerce";

export async function GET() {
  const admin = getSupabaseAdmin();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const results: Record<string, unknown> = {};

  // 1. Check bucket exists
  const { data: bucket, error: bucketErr } = await admin.storage.getBucket("product-images");
  results.bucket = bucket ? "exists" : { missing: true, error: bucketErr?.message };

  // 2. Get first product with images
  const products = await getProducts({ per_page: 1, page: 1 });
  if (!products.length) {
    return NextResponse.json({ ...results, error: "No products found" });
  }

  const product = products[0];
  results.product = { id: product.id, name: product.name, imageCount: product.images.length };

  if (!product.images.length) {
    return NextResponse.json({ ...results, error: "Product has no images" });
  }

  const image = product.images[0];
  results.imageUrl = image.src;

  // 3. Try to fetch the image from WC
  try {
    const res = await fetch(image.src, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
      },
    });
    results.fetchStatus = res.status;
    results.fetchHeaders = Object.fromEntries(res.headers.entries());

    if (!res.ok) {
      return NextResponse.json({ ...results, error: `Fetch failed with ${res.status}` });
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buffer = await res.arrayBuffer();
    results.fetchedBytes = buffer.byteLength;
    results.contentType = contentType;

    // 4. Try to upload to Supabase Storage
    const ext = contentType.includes("png") ? "png"
      : contentType.includes("webp") ? "webp"
      : contentType.includes("gif") ? "gif"
      : "jpg";

    const path = `test/${product.id}-${image.id}.${ext}`;
    const { data: uploadData, error: uploadErr } = await admin.storage
      .from("product-images")
      .upload(path, buffer, { contentType, upsert: true });

    results.upload = uploadErr
      ? { error: uploadErr.message, statusCode: (uploadErr as any).statusCode }
      : { success: true, path: uploadData?.path };

    // 5. Check the public URL
    if (!uploadErr) {
      results.publicUrl = `${supabaseUrl}/storage/v1/object/public/product-images/${path}`;
    }
  } catch (err) {
    results.fetchError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(results);
}
