const faqs = [
  {
    question: "Do Your Knives Come With Boxes?",
    answer: "Yes, all knives and knife sets come in a presentation box.",
  },
  {
    question: "How Long Does Shipping Take?",
    answer:
      "We offer free USPS Priority Mail shipping on all orders. All orders placed before 12pm EST are shipped the same day.",
  },
  {
    question: "Is Tracking Available?",
    answer:
      "Yes, USPS will provide tracking updates via email.",
  },
  {
    question: "Are Your Products Age Restricted?",
    answer:
      "Yes, you must be 18 or older to purchase a chef\u2019s knife online.",
  },
  {
    question: "Are You A Dropshipping Site?",
    answer:
      "Absolutely not! We hold our own branded inventory in our US fulfillment partner's warehouse in Illinois, and every US order is picked, packed and shipped from there with USPS tracking.\n\nThere are a lot of companies out there shipping rubbish directly from China and not only is their quality subpar, their customer service is very poor, requiring you to return their knives to an address in China.\n\nReturns are managed through our [Returns & Refunds](/refund_returns) page.",
  },
  {
    question: "How Do I Return A Knife?",
    answer:
      "Returns are handled through our self-service [Returns & Refunds](/refund_returns) portal — enter your order number, follow the steps, and we'll refund you once the knife arrives back with us.",
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
