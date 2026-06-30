const faqs = [
  {
    question: "Do Your Knives Come With Boxes?",
    answer: "Yes, all knives and knife sets come in a presentation box.",
  },
  {
    question: "How Long Does Shipping Take?",
    answer:
      "We offer free USPS Priority Mail shipping on all orders, delivered in 3–5 business days. Upgrade to USPS Priority Mail Express at checkout for $5.99 to receive your order in 1–3 business days. All orders placed before 12pm EST are shipped the same day.",
  },
  {
    question: "Is Tracking Available?",
    answer:
      "Yes, USPS will provide tracking updates via email.",
  },
  {
    question: "Are Your Products Age Restricted?",
    answer:
      "Yes \u2014 it\u2019s our store policy that customers must be 18 or older to purchase a knife from us. By placing an order, you confirm you meet this requirement.",
  },
  {
    question: "Are You A Dropshipping Site?",
    answer:
      "Absolutely not. Shimeru is our own branded knife line, stocked in our US fulfillment partner's warehouse in Illinois. Every US order is picked, packed and shipped from there via USPS Priority Mail, orders placed before 12pm EST go out the same day, tracked, with delivery in 3–5 business days.\n\nA lot of sites you'll see selling lookalike Damascus knives are dropshippers fulfilling directly from China. The easiest tell is the delivery estimate: if a US site quotes 5+ business days, the knife is almost certainly on a slow boat from a warehouse in Guangzhou, not sitting on a shelf in the States. USPS Priority Mail doesn't take that long, do not be fooled by imitations.\n\nThe other tell comes after the sale. When something goes wrong, dropshippers ask you to ship the knife back to a Chinese return address at your own expense, which usually costs more than the knife. We handle every return ourselves through our [Returns & Refunds](/refund_returns) page, to a US address, with no hoops.",
  },
  {
    question: "How Do I Return A Knife?",
    answer:
      "Returns are handled through our self-service [Returns & Refunds](/refund_returns) portal, enter your order number, follow the steps, and we'll refund you once the knife arrives back with us.",
  },
];

function renderAnswer(text: string) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (match) {
      return (
        <a key={i} href={match[2]} className="underline underline-offset-4 hover:text-foreground">
          {match[1]}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function ProductFaq() {
  return (
    <div>
      <h2 className="text-sm tracking-[0.2em] uppercase text-muted-foreground mb-4">
        Frequently Asked Questions
      </h2>
      <div className="divide-y divide-border">
        {faqs.map((faq, i) => (
          <details key={i} className="group">
            <summary className="flex items-center justify-between py-4 cursor-pointer list-none gap-4 min-h-[44px] [&::-webkit-details-marker]:hidden">
              <span className="text-base font-medium">{faq.question}</span>
              <span className="text-muted-foreground shrink-0 text-lg leading-none transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="pb-4 text-base text-foreground/85 leading-relaxed whitespace-pre-line">
              {renderAnswer(faq.answer)}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
