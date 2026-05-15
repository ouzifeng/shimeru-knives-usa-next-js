import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "Terms and conditions for purchasing from Shimeru Knives.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-6 py-12 sm:py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-light tracking-tight mb-2">
        Terms and Conditions
      </h1>
      <p className="text-sm text-muted-foreground mb-10">Last Update: 01/01/2026</p>

      <div className="prose-sm space-y-8 text-sm leading-relaxed text-foreground/80">
        <p>
          Welcome to Shimeru Knives. These Terms and Conditions govern your use of our website and
          the purchase of products from our online store. By accessing this website and purchasing
          our products, you agree to abide by these terms. If you do not agree to these terms,
          please do not use our site.
        </p>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">1. Products</h2>
          <p>
            We sell Japanese chef knives and related accessories, including sharpeners, through our
            website. While we strive to ensure that all product descriptions, images, and
            specifications are accurate, there may be instances where product details such as color
            or appearance vary slightly due to differences in steel batches or other manufacturing
            factors. All products are subject to availability, and we reserve the right to
            discontinue any product at any time.
          </p>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">2. Pricing and Payment</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Pricing:</strong> All prices are listed in USD.
            </li>
            <li>
              <strong>Payment Methods:</strong> We accept payments via major credit cards, Apple
              Pay, Google Pay, and PayPal (including PayPal Pay in 4). All payment processing is
              handled securely through Stripe.
            </li>
            <li>
              <strong>Taxes and Fees:</strong> Sales tax may apply depending on your state.
              Customers outside the US should contact us for shipping rates and times.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">
            3. Shipping and Delivery
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Shipping Methods:</strong> We offer free standard shipping on all orders
              within the US. For customers outside the US, please contact us directly to discuss
              shipping rates and delivery times.
            </li>
            <li>
              <strong>Geographic Coverage:</strong> We primarily ship within the US. International
              customers should contact us for specific shipping arrangements.
            </li>
            <li>
              <strong>Order Processing:</strong> Orders are typically processed within 1–2 business
              days and shipped promptly. While we strive to meet delivery estimates, we are not
              responsible for delays caused by unforeseen circumstances.
            </li>
            <li>
              <strong>Customs and Duties:</strong> For international orders, customs duties and
              taxes may apply and are the responsibility of the buyer.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">4. Returns and Refunds</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Return Window:</strong> You may return unused and undamaged products within 60
              days of delivery for a refund.
            </li>
            <li>
              <strong>Conditions for Return:</strong> Returns are accepted only if the products are
              in their original packaging and have not been used. Items must be in the same
              condition as when they were received.
            </li>
            <li>
              <strong>Return Process:</strong> To initiate a return, please visit our website and
              follow the return instructions. Once your return request is approved, ship the item
              back to us. The return shipping address will be provided during the return process.
            </li>
            <li>
              <strong>Refund Policy:</strong> Refunds will be processed within 10 business days after we
              receive the returned item. Refunds will be issued to the original payment method.
            </li>
            <li>
              <strong>Return Shipping Costs:</strong> If the product is defective or damaged, we
              will cover the cost of return shipping. If you are returning the item due to a change
              of mind, you will be responsible for the return shipping costs.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">5. User Accounts</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Account Creation:</strong> Creating an account is optional, and you may check
              out as a guest. However, creating an account allows you to save your shipping address,
              track your orders, and access your order history.
            </li>
            <li>
              <strong>Account Benefits:</strong> By creating an account, you can enjoy a streamlined
              checkout process, access to order tracking, and saved address information.
            </li>
            <li>
              <strong>Account Termination:</strong> We reserve the right to terminate or suspend any
              account that violates these terms or engages in fraudulent or abusive behavior.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">
            6. Warranties and Guarantees
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Statutory Rights:</strong> Products are sold with the warranties required by
              applicable consumer protection law, which are not affected by these terms.
            </li>
            <li>
              <strong>Disclaimer of Warranties:</strong> Beyond those statutory rights, all products
              are provided &quot;as is&quot; without any further warranties, whether express or
              implied.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">
            7. Intellectual Property
          </h2>
          <p>
            All content on this website, including but not limited to text, images, graphics, and
            logos, is the property of Shimeru Knives and is protected by intellectual property laws.
            You may not reproduce, distribute, or use any content from our website without our prior
            written permission.
          </p>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">
            8. Limitation of Liability
          </h2>
          <p>
            To the fullest extent permitted by law, Shimeru Knives shall not be liable for any
            indirect, incidental, or consequential damages arising out of or in connection with the
            use of our products or website. Our liability is limited to the amount you paid for the
            product that is the subject of the claim.
          </p>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">
            9. Governing Law and Dispute Resolution
          </h2>
          <p>
            Shimeru Knives is operated from the United Kingdom. These terms and conditions are
            governed by and construed in accordance with the laws of England and Wales. Any
            disputes arising out of or relating to these terms shall be subject to the exclusive
            jurisdiction of the courts of England and Wales. This does not affect any statutory
            consumer rights you have under the laws of the country in which you reside.
          </p>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">
            10. Updates to Terms and Conditions
          </h2>
          <p>
            We may update these Terms and Conditions from time to time. Any changes will be posted
            on this page with an updated effective date. We encourage you to review these terms
            periodically to stay informed about any updates.
          </p>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">11. Contact Information</h2>
          <p>
            If you have any questions or concerns regarding these Terms and Conditions, please
            contact us via email or visit our{" "}
            <a href="/contact" className="text-primary underline underline-offset-2 hover:text-primary/80">
              contact page
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
