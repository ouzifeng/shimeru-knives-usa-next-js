"use client";

import { useEffect, useRef } from "react";
import { trackMetaViewContent } from "@/components/meta-pixel";
import { trackTikTokViewContent } from "@/components/tiktok-pixel";

interface Props {
  productId: number;
  productName: string;
  value: number;
}

export function ViewContentTracker({ productId, productName, value }: Props) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    const timer = setTimeout(() => {
      trackMetaViewContent(String(productId), productName, value);
      trackTikTokViewContent(String(productId), productName, value);
    }, 500);

    return () => clearTimeout(timer);
  }, [productId, productName, value]);

  return null;
}
