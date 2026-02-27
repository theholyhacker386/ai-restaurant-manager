export default function PrivacySecurityPage() {
  return (
    <div className="min-h-screen bg-porch-cream pb-24">
      <div className="bg-gradient-to-b from-porch-brown to-porch-brown/90 text-white px-4 pt-12 pb-6">
        <h1 className="text-2xl font-display font-bold">
          Privacy & Security
        </h1>
        <p className="text-porch-cream/70 text-sm mt-1">
          How we protect your data
        </p>
      </div>

      <div className="px-4 -mt-3 space-y-4">
        {/* Last updated */}
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4 text-center">
          <p className="text-[10px] text-porch-brown-light/40 uppercase tracking-wider font-semibold">
            Last updated: February 2026
          </p>
        </div>

        {/* Privacy Policy */}
        <Section title="Privacy Policy" icon="🔒">
          <P>
            AI Assistant Manager (&quot;we&quot;, &quot;our&quot;, &quot;the platform&quot;) is a financial
            management platform for food service businesses. This policy explains
            how we collect, use, and protect your information.
          </P>

          <H3>What We Collect</H3>
          <P>
            When you use our platform, we may collect the following information:
          </P>
          <UL>
            <LI>
              <strong>Account Information:</strong> Your name, email address, and
              business name when you sign up.
            </LI>
            <LI>
              <strong>Financial Data:</strong> Bank account transactions, balances,
              and account details when you connect your bank through Plaid. Sales
              data from your point-of-sale system (Square).
            </LI>
            <LI>
              <strong>Business Data:</strong> Menu items, ingredients, recipes,
              expenses, and operational data you enter into the platform.
            </LI>
            <LI>
              <strong>Usage Data:</strong> How you interact with the platform to
              help us improve the experience.
            </LI>
          </UL>

          <H3>How We Use Your Data</H3>
          <UL>
            <LI>To provide financial management and reporting services</LI>
            <LI>
              To automatically categorize and track your business expenses
            </LI>
            <LI>To generate profit & loss statements and KPI analysis</LI>
            <LI>To improve our AI-powered categorization and insights</LI>
            <LI>To communicate with you about your account and our services</LI>
          </UL>

          <H3>How We Share Your Data</H3>
          <P>
            We do <strong>not</strong> sell your personal or financial data. We
            share data only with:
          </P>
          <UL>
            <LI>
              <strong>Plaid:</strong> To securely connect to your bank accounts
              and retrieve transaction data
            </LI>
            <LI>
              <strong>Square:</strong> To retrieve your sales and labor data
            </LI>
            <LI>
              <strong>OpenAI:</strong> To power AI features like transaction
              categorization and receipt scanning (no personally identifiable
              information is shared)
            </LI>
            <LI>
              <strong>Stripe:</strong> To process subscription payments
            </LI>
          </UL>
        </Section>

        {/* Data Security */}
        <Section title="Data Security" icon="🛡️">
          <H3>Encryption</H3>
          <UL>
            <LI>
              <strong>In Transit:</strong> All data transmitted between your
              device and our servers is encrypted using TLS 1.2 or higher
              (HTTPS). This means your information is scrambled during transfer
              and cannot be read by anyone intercepting it.
            </LI>
            <LI>
              <strong>At Rest:</strong> All consumer data stored in our database
              is encrypted using AES-256 encryption. Even if someone gained
              access to the storage, the data would be unreadable without the
              encryption keys.
            </LI>
          </UL>

          <H3>Access Controls</H3>
          <UL>
            <LI>
              Access to production systems is restricted to authorized personnel
              only
            </LI>
            <LI>
              All API keys and secrets are stored in secure server-side
              environment variables, never exposed in client-side code
            </LI>
            <LI>
              Database connections require authenticated credentials
            </LI>
            <LI>
              Code repositories are private with two-factor authentication
              enabled
            </LI>
            <LI>
              All third-party services require individual login with strong
              passwords and multi-factor authentication where available
            </LI>
          </UL>

          <H3>Infrastructure Security</H3>
          <UL>
            <LI>
              Hosted on Vercel, which provides automatic security patching,
              DDoS protection, and enterprise-grade infrastructure
            </LI>
            <LI>
              Database hosted on Neon, which provides encrypted storage,
              automated backups, and SOC 2 Type II compliance
            </LI>
            <LI>
              GitHub dependency vulnerability alerts are enabled for proactive
              security monitoring
            </LI>
            <LI>
              All packages and dependencies are kept up to date regularly
            </LI>
          </UL>

          <H3>Vulnerability Management</H3>
          <P>
            We use managed services (Vercel, Neon) that handle infrastructure
            security and patching automatically. We monitor for dependency
            vulnerabilities through GitHub security alerts and apply patches
            promptly.
          </P>
        </Section>

        {/* Information Security */}
        <Section title="Information Security Governance" icon="📋">
          <P>
            Our information security practices are designed to identify, mitigate,
            and monitor security risks relevant to our business:
          </P>
          <UL>
            <LI>
              Regular review of access controls and permissions
            </LI>
            <LI>
              Secure credential management using environment variables and secret
              managers
            </LI>
            <LI>
              Incident response procedures for security events
            </LI>
            <LI>
              Ongoing evaluation and improvement of security practices
            </LI>
          </UL>
          <P>
            For security inquiries, contact:{" "}
            <strong>shopcolby@gmail.com</strong>
          </P>
        </Section>

        {/* Bank Connection (Plaid) */}
        <Section title="Bank Connection Security" icon="🏦">
          <P>
            We use <strong>Plaid</strong> to securely connect to your bank
            account. Here&apos;s how it works:
          </P>
          <UL>
            <LI>
              We <strong>never</strong> see or store your bank login credentials.
              Plaid handles the authentication directly with your bank.
            </LI>
            <LI>
              Plaid uses bank-level encryption and is regularly audited for
              security compliance (SOC 2 Type II certified).
            </LI>
            <LI>
              We only access the data you authorize — transaction history and
              account balances.
            </LI>
            <LI>
              You can disconnect your bank account at any time from the
              dashboard. When disconnected, we revoke access immediately.
            </LI>
          </UL>
        </Section>

        {/* User Consent */}
        <Section title="Your Consent" icon="✅">
          <P>
            We believe in transparent data practices. Here&apos;s how we obtain your
            consent:
          </P>
          <UL>
            <LI>
              <strong>Account Creation:</strong> By creating an account, you
              consent to the collection and processing of the data described in
              this policy.
            </LI>
            <LI>
              <strong>Bank Connection:</strong> When you connect your bank
              account, you explicitly authorize access through Plaid&apos;s secure
              consent flow. No financial data is accessed without your direct
              action.
            </LI>
            <LI>
              <strong>AI Features:</strong> Transaction categorization and
              analysis are performed automatically to improve your experience.
              You review and approve all categorizations.
            </LI>
          </UL>
        </Section>

        {/* Data Retention & Deletion */}
        <Section title="Data Retention & Deletion" icon="🗑️">
          <H3>How Long We Keep Your Data</H3>
          <UL>
            <LI>
              <strong>Account data:</strong> Retained as long as your account is
              active. Deleted within 30 days of account closure.
            </LI>
            <LI>
              <strong>Transaction data:</strong> Retained for up to 24 months for
              financial reporting purposes, unless you request earlier deletion.
            </LI>
            <LI>
              <strong>Bank connection tokens:</strong> Revoked immediately when
              you disconnect your bank. Access tokens are deleted within 24
              hours.
            </LI>
          </UL>

          <H3>Your Rights</H3>
          <P>You have the right to:</P>
          <UL>
            <LI>
              <strong>Access:</strong> Request a copy of all data we hold about
              you
            </LI>
            <LI>
              <strong>Correction:</strong> Request correction of inaccurate data
            </LI>
            <LI>
              <strong>Deletion:</strong> Request deletion of your data at any
              time
            </LI>
            <LI>
              <strong>Portability:</strong> Request your data in a portable
              format
            </LI>
            <LI>
              <strong>Disconnect:</strong> Revoke bank access at any time from
              your dashboard
            </LI>
          </UL>
          <P>
            To exercise any of these rights, contact us at{" "}
            <strong>shopcolby@gmail.com</strong>. We will respond within 30
            days.
          </P>
        </Section>

        {/* Multi-Factor Authentication */}
        <Section title="Authentication Security" icon="🔐">
          <P>
            We implement multiple layers of authentication to protect your
            account:
          </P>
          <UL>
            <LI>
              Secure password-based authentication with encrypted password
              storage (bcrypt hashing)
            </LI>
            <LI>
              Session management with secure, encrypted tokens (JWT)
            </LI>
            <LI>
              Plaid Link is only accessible to authenticated, logged-in users
            </LI>
            <LI>
              Multi-factor authentication available for enhanced security
            </LI>
          </UL>
        </Section>

        {/* Contact */}
        <Section title="Contact Us" icon="📧">
          <P>
            If you have any questions about our privacy or security practices,
            or wish to exercise your data rights, please contact:
          </P>
          <div className="bg-porch-cream/50 rounded-xl px-4 py-3 mt-2">
            <p className="text-sm font-medium text-porch-brown">
              Colby Caldwell
            </p>
            <p className="text-xs text-porch-brown-light/60">
              Owner / Founder
            </p>
            <p className="text-xs text-porch-teal mt-1">
              shopcolby@gmail.com
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}

/* — Helper Components — */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-porch-cream-dark/30 flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <h2 className="text-sm font-bold text-porch-brown">{title}</h2>
      </div>
      <div className="px-4 py-4 space-y-3">{children}</div>
    </div>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold text-porch-brown mt-2">{children}</h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-porch-brown-light/70 leading-relaxed">
      {children}
    </p>
  );
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-1.5 ml-1">{children}</ul>;
}

function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-xs text-porch-brown-light/70 leading-relaxed flex gap-2">
      <span className="text-porch-teal mt-0.5 shrink-0">•</span>
      <span>{children}</span>
    </li>
  );
}
