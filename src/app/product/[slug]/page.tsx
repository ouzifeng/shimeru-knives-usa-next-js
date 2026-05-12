import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProductBySlug, getProductAttributes, getProductSeo, getRelatedProducts, getProductSpecs, getInStockAlternatives, getRestockEta } from "@/lib/products";

export const revalidate = 3600;
import { ProductSpecsGrid } from "@/components/product-specs";
import { ProductCard } from "@/components/product-card";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { ImageGallery } from "@/components/image-gallery";
import { ProductReviewsLoader } from "@/components/product-reviews-loader";
import { ProductFaq } from "@/components/product-faq";
import { StarRating } from "@/components/star-rating";
import { formatPrice } from "@/lib/format";
import { storeConfig } from "../../../../store.config";
import type { Product } from "@/lib/types";
import { KnifeCareModal } from "@/components/knife-care-modal";
import { KnifeGuideCta } from "@/components/knife-guide-cta";
import { ViewContentTracker } from "@/components/view-content-tracker";
import { RecentlyViewedTracker } from "@/components/recently-viewed-tracker";
import { RecentlyViewed } from "@/components/recently-viewed";
import { InStockAlternatives } from "@/components/in-stock-alternatives";
import { NotifyWhenBackInStock } from "@/components/notify-when-back-in-stock";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};

  const seo = await getProductSeo(product.id);
  const plainDesc = product.short_description.replace(/<[^>]*>/g, "").slice(0, 160);
  const title = seo?.meta_title || `${product.name} | ${storeConfig.name}`;
  const description = seo?.meta_description || plainDesc;
  const url = `${storeConfig.url}/product/${product.slug}`;

  return {
    title,
    description,
    keywords: seo?.focus_keyword || undefined,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: seo?.og_title || product.name,
      description: seo?.og_description || description,
      url,
      siteName: storeConfig.name,
      type: "website",
      images: product.images.map((img, i) => ({
        url: img.src,
        alt: seo?.image_alt_texts?.[i] || img.alt || product.name,
      })),
    },
    twitter: {
      card: "summary_large_image",
      title: seo?.og_title || product.name,
      description: seo?.og_description || description,
    },
    other: {
      "product:price:amount": String(product.price),
      "product:price:currency": storeConfig.currency,
      "product:availability": product.stock_status === "instock" ? "in stock" : "out of stock",
    },
  };
}

function ProductJsonLd({ product, seo }: { product: Product; seo: any }) {
  const url = `${storeConfig.url}/product/${product.slug}`;
  const description = (product.short_description || product.description || "").replace(/<[^>]*>/g, "").slice(0, 5000);

  const schema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description,
    url,
    sku: String(product.id),
    image: product.images.map((img) => ({
      "@type": "ImageObject",
      url: img.src,
      contentUrl: img.src,
    })),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: storeConfig.currency,
      price: product.on_sale && product.sale_price ? product.sale_price : product.price,
      availability: product.stock_status === "instock"
        ? "https://schema.org/InStock"
        : product.stock_status === "onbackorder"
          ? "https://schema.org/BackOrder"
          : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      seller: {
        "@type": "Organization",
        name: storeConfig.name,
        url: storeConfig.url,
      },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: 0,
          currency: storeConfig.currency,
        },
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: "US",
        },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
          transitTime: { "@type": "QuantitativeValue", minValue: 3, maxValue: 5, unitCode: "DAY" },
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "US",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 60,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/FreeReturn",
      },
    },
    brand: {
      "@type": "Brand",
      name: storeConfig.name,
    },
  };

  if (product.on_sale && product.regular_price && product.sale_price) {
    schema.offers.priceSpecification = [
      {
        "@type": "UnitPriceSpecification",
        price: product.sale_price,
        priceCurrency: storeConfig.currency,
        priceType: "https://schema.org/SalePrice",
      },
      {
        "@type": "UnitPriceSpecification",
        price: product.regular_price,
        priceCurrency: storeConfig.currency,
        priceType: "https://schema.org/ListPrice",
      },
    ];
  }

  if (storeConfig.showReviews && product.rating_count > 0 && product.average_rating) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: product.average_rating,
      reviewCount: product.rating_count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  if (product.categories?.length) {
    schema.category = product.categories.map((c) => c.name).join(" > ");
  }

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: storeConfig.url },
      { "@type": "ListItem", position: 2, name: "Knives", item: `${storeConfig.url}/product` },
      ...(product.categories?.[0]
        ? [
            { "@type": "ListItem", position: 3, name: product.categories[0].name, item: `${storeConfig.url}/product?category=${product.categories[0].slug}` },
            { "@type": "ListItem", position: 4, name: product.name, item: url },
          ]
        : [
            { "@type": "ListItem", position: 3, name: product.name, item: url },
          ]),
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "Do You Offer Payment Terms?", acceptedAnswer: { "@type": "Answer", text: "Yes, we offer PayPal Pay Later, Klarna and Afterpay, both of whom offer a range of buy now pay later options. Just choose PayPal Pay Later, Klarna or Afterpay as a payment method at checkout." } },
          { "@type": "Question", name: "Do Your Knives Come With Boxes?", acceptedAnswer: { "@type": "Answer", text: "Yes, all knives and knife sets come in a presentation box." } },
          { "@type": "Question", name: "How Long Does Shipping Take?", acceptedAnswer: { "@type": "Answer", text: "We offer free USPS Priority Mail shipping on all orders. All orders placed before 12pm EST are shipped the same day." } },
          { "@type": "Question", name: "Is Tracking Available?", acceptedAnswer: { "@type": "Answer", text: "Yes, USPS will provide tracking updates via email." } },
          { "@type": "Question", name: "Are Your Products Age Restricted?", acceptedAnswer: { "@type": "Answer", text: "Yes, you must be 18 or older to purchase a chef's knife online." } },
          { "@type": "Question", name: "Are You A Dropshipping Site?", acceptedAnswer: { "@type": "Answer", text: "No. We hold our own branded inventory in our US fulfillment partner's warehouse in Illinois, and every US order is picked, packed and shipped from there with USPS tracking. Returns go back to that same Illinois address. We are a UK based business but our US operations run end-to-end from the US." } },
          { "@type": "Question", name: "How Do I Return A Knife?", acceptedAnswer: { "@type": "Answer", text: "Returns are straightforward. Email us with your order number, and we will provide you with a prepaid return label. Once our warehouse has received it, we will refund the order." } },
        ],
      }) }} />
    </>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [attributes, seo, relatedProducts, specs, inStockAlternatives, restockEta] = await Promise.all([
    product.type === "variable" ? getProductAttributes(product.id) : Promise.resolve([]),
    getProductSeo(product.id),
    getRelatedProducts(product.id, product.categories?.[0]?.slug),
    getProductSpecs(product.id),
    product.stock_status === "outofstock"
      ? getInStockAlternatives(product.id, product.categories?.[0]?.slug, 6)
      : Promise.resolve([]),
    product.stock_status === "outofstock"
      ? getRestockEta(product.id)
      : Promise.resolve(null),
  ]);

  const restockEtaDays = restockEta
    ? Math.max(1, Math.ceil((restockEta.getTime() - Date.now()) / 86_400_000))
    : null;

  const isVariable = product.type === "variable";

  const imagesWithAlt = product.images.map((img: any, i: number) => ({
    ...img,
    alt: seo?.image_alt_texts?.[i] || img.alt || product.name,
  }));

  return (
    <>
      <ViewContentTracker productId={product.id} productName={product.name} value={product.price} />
      <RecentlyViewedTracker product={product} />
      <ProductJsonLd product={product} seo={seo} />

      <div className="container mx-auto px-4 lg:px-8 py-6 lg:py-12 overflow-hidden">
        {/* Breadcrumb — hidden on mobile, not useful on small screens */}
        <nav aria-label="Breadcrumb" className="hidden md:block text-xs tracking-wide text-muted-foreground mb-8">
          <ol className="flex items-center gap-2 flex-wrap">
            <li><a href="/" className="hover:text-foreground transition-colors">Home</a></li>
            <li className="text-border">/</li>
            <li><a href="/product" className="hover:text-foreground transition-colors">Knives</a></li>
            {product.categories?.[0] && (
              <>
                <li className="text-border">/</li>
                <li>
                  <a href={`/product?category=${product.categories[0].slug}`} className="hover:text-foreground transition-colors">
                    {product.categories[0].name}
                  </a>
                </li>
              </>
            )}
            <li className="text-border">/</li>
            <li className="text-foreground truncate max-w-[200px]">{product.name}</li>
          </ol>
        </nav>

        <div className="grid md:grid-cols-2 gap-6 md:gap-8 lg:gap-16">
          {/* Images */}
          <div className="min-w-0">
            <ImageGallery images={imagesWithAlt} onSale={product.on_sale} outOfStock={product.stock_status === "outofstock"} />
          </div>

          {/* Product info */}
          <div className="space-y-5 lg:space-y-6 lg:py-4 min-w-0">
            {/* Category label */}
            {product.categories?.[0] && (
              <p className="text-sm tracking-[0.25em] uppercase text-muted-foreground">
                {product.categories[0].name}
              </p>
            )}

            <div className="space-y-2.5">
              <h1 className="font-serif text-3xl sm:text-4xl lg:text-[2.75rem] font-light leading-tight">{product.name}</h1>

              {storeConfig.showReviews && product.rating_count > 0 && product.average_rating && (
                <div className="flex items-center gap-2">
                  <StarRating rating={product.average_rating} size="lg" />
                  <span className="text-base text-muted-foreground">
                    {product.average_rating.toFixed(1)} ({product.rating_count} {product.rating_count === 1 ? "review" : "reviews"})
                  </span>
                </div>
              )}

              <div className="flex items-baseline gap-2 sm:gap-3 flex-wrap">
                <span className="text-2xl sm:text-3xl font-medium">
                  {formatPrice(product.price)}
                </span>
                {product.on_sale && product.regular_price && (
                  <span className="text-lg sm:text-xl text-muted-foreground line-through">
                    {formatPrice(product.regular_price)}
                  </span>
                )}
              </div>

              {/* BNPL messaging */}
              <p className="text-base text-muted-foreground">
                or 3 interest-free payments of{" "}
                <span className="text-foreground font-medium">
                  {formatPrice(product.price / 3)}
                </span>
                {" "}with Klarna or Afterpay
              </p>
            </div>

            {/* Stock */}
            <div className="flex items-center gap-2">
              {product.stock_status === "instock" ? (
                product.stock_quantity !== null && product.stock_quantity > 0 && product.stock_quantity < 5 ? (
                  <>
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
                    <span className="text-base text-red-600 font-medium">Only {product.stock_quantity} left in stock</span>
                  </>
                ) : product.stock_quantity !== null && product.stock_quantity > 0 && product.stock_quantity < 10 ? (
                  <>
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-base text-amber-600 font-medium">Low stock — only {product.stock_quantity} left</span>
                  </>
                ) : (
                  <>
                    <span className="h-2.5 w-2.5 rounded-full bg-green-600 shrink-0" />
                    <span className="text-base text-green-700 font-medium">In Stock</span>
                  </>
                )
              ) : product.stock_status === "onbackorder" ? (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-base text-amber-600 font-medium">Available on Backorder</span>
                </>
              ) : (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
                  <span className="text-base text-red-600 font-medium">Out of Stock</span>
                </>
              )}
            </div>

            <div className="border-t border-border pt-5 sm:pt-6">
              <AddToCartButton
                product={product}
                attributes={attributes.length ? attributes : undefined}
                belowButton={
                  product.stock_status === "outofstock" && restockEtaDays !== null ? (
                    <NotifyWhenBackInStock
                      productId={product.id}
                      productName={product.name}
                      etaDays={restockEtaDays}
                    />
                  ) : null
                }
              />
            </div>

            {product.stock_status === "outofstock" && (
              <InStockAlternatives
                products={inStockAlternatives}
                categorySlug={product.categories?.[0]?.slug}
                categoryName={product.categories?.[0]?.name}
              />
            )}

            {/* Knife specs */}
            {specs && (
              <div className="border-t border-border pt-5 sm:pt-6">
                <h2 className="text-sm tracking-[0.2em] uppercase text-muted-foreground mb-4">Specifications</h2>
                <ProductSpecsGrid specs={specs} />
              </div>
            )}

            {/* Trust signals */}
            <div className="border-t border-border pt-5 sm:pt-6 grid grid-cols-2 gap-3 sm:gap-4">
              {[
                { title: "Free US Shipping", desc: "USPS Priority Mail" },
                { title: "60-Day Returns", desc: "No questions asked" },
                { title: "Secure Payment", desc: "Stripe encrypted checkout" },
              ].map((item) => (
                <div key={item.title}>
                  <p className="text-base font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              ))}
              <KnifeCareModal />
            </div>
          </div>
        </div>

        {/* Full-width sections below the grid */}
        <div className="mt-12 lg:mt-16 grid md:grid-cols-2 gap-12 lg:gap-16">
          {/* Description */}
          <div>
            <h2 className="text-sm tracking-[0.2em] uppercase text-muted-foreground mb-4">Description</h2>
            <div
              className="max-w-none text-base text-foreground leading-relaxed overflow-hidden break-words [&_p]:mb-4 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_img]:max-w-full [&_table]:w-full [&_iframe]:max-w-full"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          </div>

          {/* Why Shimeru */}
          <div>
            <h2 className="text-sm tracking-[0.2em] uppercase text-muted-foreground mb-5">Why Shimeru?</h2>
            <div className="space-y-5">
              {[
                {
                  title: "Precision-Engineered High-Carbon Steel",
                  desc: "Crafted from professional-grade, heat-treated high-carbon steel, Shimeru Knives deliver exceptional sharpness, durability, and edge retention. From the first slice, you\u2019ll experience the precision that sets us apart.",
                },
                {
                  title: "Uncompromising Sharpness",
                  desc: "Engineered for unmatched sharpness\u2014razor-sharp blades that elevate your culinary experience.",
                },
                {
                  title: "Ergonomically Designed Handles",
                  desc: "Shimeru Knives feature uniquely designed handles that not only add a sophisticated touch to your kitchen but also provide a comfortable, secure grip for effortless chopping and slicing.",
                },
                {
                  title: "Precision Double-Bevel 15\u00b0 Blade Edge",
                  desc: "With a double-bevel edge sharpened to 15\u00b0\u2014compared to the standard 20-25\u00b0 of most Western knives\u2014our blades allow for noticeably smoother, faster cuts.",
                },
              ].map((item) => (
                <div key={item.title}>
                  <h3 className="text-base font-semibold mb-1">{item.title}</h3>
                  <p className="text-base text-foreground/85 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Reviews — full width, streamed via Suspense */}
        <div className="mt-12 lg:mt-16 grid md:grid-cols-2 gap-12 lg:gap-16">
          {storeConfig.showReviews && (
            <div>
              <Suspense fallback={<ReviewsSkeleton />}>
                <ProductReviewsLoader
                  productId={product.id}
                  averageRating={product.average_rating || 0}
                  ratingCount={product.rating_count || 0}
                />
              </Suspense>
            </div>
          )}

          {/* FAQ */}
          <div>
            <ProductFaq />
          </div>
        </div>

        {/* Knife Guide CTA */}
        <div className="mt-12 lg:mt-16 -mx-4 lg:-mx-8">
          <KnifeGuideCta />
        </div>

        {/* Recently Viewed */}
        <RecentlyViewed currentProductId={product.id} />

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className="mt-12 lg:mt-16">
            <h2 className="text-sm tracking-[0.2em] uppercase text-muted-foreground mb-6">You May Also Like</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {relatedProducts.map((relatedProduct) => (
                <ProductCard key={relatedProduct.id} product={relatedProduct} />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ReviewsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-32 bg-muted rounded mb-4" />
      <div className="flex items-center gap-3 mb-6">
        <div className="h-4 w-24 bg-muted rounded" />
        <div className="h-4 w-20 bg-muted rounded" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="py-5 border-b border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-muted" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-24 bg-muted rounded" />
              <div className="h-3 w-32 bg-muted rounded" />
            </div>
          </div>
          <div className="pl-11 space-y-2">
            <div className="h-3.5 w-full bg-muted rounded" />
            <div className="h-3.5 w-3/4 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
