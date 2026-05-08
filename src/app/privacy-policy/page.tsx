import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Shimeru Knives collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-6 py-12 sm:py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-light tracking-tight mb-2">
        Privacy Policy
      </h1>
      <p className="text-sm text-muted-foreground mb-10">Updated: 01/01/2026</p>

      <div className="prose-sm space-y-8 text-sm leading-relaxed text-foreground/80">
        <p>
          At Shimeru Knives, we are committed to protecting your privacy. This Privacy Policy
          explains how we collect, use, disclose, and safeguard your information when you visit our
          website, purchase products, or interact with us. Please read this policy carefully to
          understand our views and practices regarding your personal data and how we will treat it.
        </p>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">1. Information We Collect</h2>
          <p className="mb-3">
            We collect various types of information in connection with the services we provide,
            including:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Personal Information:</strong> When you make a purchase or attempt to make a
              purchase through our site, we collect certain personal information from you, including
              your name, billing address, shipping address, payment information (including credit
              card numbers), email address, and phone number.
            </li>
            <li>
              <strong>Device Information:</strong> We automatically collect information about your
              device, including your web browser, IP address, time zone, and some of the cookies
              that are installed on your device.
            </li>
            <li>
              <strong>Order Information:</strong> We collect information related to the transactions
              you make on our site, including your purchase history and preferences.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">
            2. How We Use Your Information
          </h2>
          <p className="mb-3">
            We use the information we collect in several ways, including:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Order Processing:</strong> To process your orders, deliver products, and
              communicate with you regarding your orders.
            </li>
            <li>
              <strong>Customer Service:</strong> To manage customer service inquiries and to address
              your questions or concerns.
            </li>
            <li>
              <strong>Marketing:</strong> To send you promotional information and updates about our
              products and services, where you have opted in to receive such communications.
            </li>
            <li>
              <strong>Improvement:</strong> To improve our website, products, and services based on
              the data and feedback we receive from you.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">
            3. Sharing Your Information
          </h2>
          <p className="mb-3">We may share your personal information with:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Service Providers:</strong> Third-party vendors who help us with various
              business operations such as payment processing, shipping, and customer support.
            </li>
            <li>
              <strong>Legal Requirements:</strong> If required to do so by law, or if we believe
              such action is necessary to comply with legal obligations, protect our rights, or
              prevent fraud.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">4. Data Security</h2>
          <p>
            We implement appropriate technical and organizational security measures to protect your
            personal information against unauthorized access, alteration, disclosure, or destruction.
          </p>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">5. Cookies</h2>
          <p>
            We use cookies and similar tracking technologies to enhance your browsing experience on
            our site, analyze site traffic, and personalize content. You can manage your cookie
            preferences through your browser settings.
          </p>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">6. Your Rights</h2>
          <p>
            You have certain rights concerning your personal information, including the right to
            access, correct, or delete your data. To exercise these rights, please contact us at the
            information provided below.
          </p>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">
            7. Changes to This Privacy Policy
          </h2>
          <p>
            We may update this Privacy Policy from time to time. Any changes will be posted on this
            page with an updated effective date.
          </p>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">8. Data Controller and Contact</h2>
          <p className="mb-3">
            The data controller responsible for your personal information is:
          </p>
          <p className="mb-3">
            <strong>Shimeru Knives</strong><br />
            Kemp House, 152–160 City Road<br />
            London, EC1V 2NX<br />
            United Kingdom<br />
            Email:{" "}
            <a href="mailto:sales@shimeruknives.co.uk" className="text-primary underline underline-offset-2 hover:text-primary/80">
              sales@shimeruknives.co.uk
            </a>
          </p>
          <p>
            US orders are fulfilled by our partner warehouse in Bolingbrook, Illinois. For any
            questions about this Privacy Policy or to exercise your data rights, please contact us
            at the email above or via our{" "}
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
