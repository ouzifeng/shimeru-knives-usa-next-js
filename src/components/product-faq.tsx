const faqs = [
  {
    question: "Do You Offer Payment Terms?",
    answer:
      "Yes, we offer PayPal Pay Later, Klarna and Afterpay, both of whom offer a range of buy now pay later options.\n\nJust choose PayPal Pay Later, Klarna or Afterpay as a payment method at checkout.",
  },
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
      "No. We hold our own branded inventory in our US fulfillment partner's warehouse in Illinois, and every US order is picked, packed and shipped from there with USPS tracking.\n\nReturns go back to that same Illinois address — never overseas. We're a UK based business, but our US operations run end-to-end from the US to keep delivery and returns fast for US customers.",
  },
  {
    question: "How Do I Return A Knife?",
    answer:
      "Returns are straightforward. Email us with your order number, and we will provide you with a prepaid return label. Once our warehouse has received it, we will refund the order.",
  },
];

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
              {faq.answer}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
