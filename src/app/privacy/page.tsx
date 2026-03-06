export default function PrivacySecurityPage() {
  return (
    <div className="min-h-screen bg-porch-cream pb-24">
      <div className="bg-gradient-to-b from-porch-brown to-porch-brown/90 text-white px-4 pt-12 pb-6">
        <h1 className="text-2xl font-bold">
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
            Last updated: March 2026
          </p>
        </div>

        {/* 1. Privacy Policy */}
        <Section title="Privacy Policy" icon="🔒">
          <P>
            AI Restaurant Manager (&quot;we&quot;, &quot;our&quot;, &quot;the platform&quot;) is a
            multi-tenant restaurant management platform. This policy explains
            how we collect, use, and protect your information.
          </P>

          <H3>Multi-Tenant Data Isolation</H3>
          <P>
            Each restaurant&apos;s data is completely isolated using a unique
            restaurant identifier (restaurant_id). No restaurant can access
            another restaurant&apos;s data. All queries are scoped to the
            authenticated restaurant, ensuring complete data separation.
          </P>

          <H3>What We Collect</H3>
          <P>
            When you use our platform, we may collect the following information:
          </P>
          <UL>
            <LI>
              <strong>Account Information:</strong> Your name, email address, and
              restaurant name when you sign up.
            </LI>
            <LI>
              <strong>Financial Data:</strong> Bank account transactions, balances,
              and account details when you connect your bank through Plaid. Sales
              data from your point-of-sale system (Square).
            </LI>
            <LI>
              <strong>Business Data:</strong> Menu items, ingredients, recipes,
              expenses, inventory, and operational data you enter into the platform.
            </LI>
            <LI>
              <strong>Usage Data:</strong> How you interact with the platform to
              help us improve the experience.
            </LI>
          </UL>

          <H3>How We Use Your Data</H3>
          <UL>
            <LI>To provide restaurant management and financial reporting services</LI>
            <LI>
              To automatically categorize and track your business expenses
            </LI>
            <LI>To generate profit & loss statements and KPI analysis</LI>
            <LI>To power AI-driven insights for menu optimization and cost control</LI>
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
              categorization, recipe analysis, and receipt scanning (no personally
              identifiable information is shared)
            </LI>
          </UL>
        </Section>

        {/* 2. Data Security */}
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
              <strong>At Rest:</strong> All sensitive data stored in our database
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
            vulnerabilities through GitHub Dependabot and apply patches per our
            defined SLA:
          </P>
          <UL>
            <LI>
              <strong>Critical vulnerabilities:</strong> Patched within 24 hours
            </LI>
            <LI>
              <strong>High severity:</strong> Patched within 7 days
            </LI>
            <LI>
              <strong>Medium severity:</strong> Patched within 30 days
            </LI>
            <LI>
              <strong>Low severity:</strong> Addressed in next maintenance cycle
            </LI>
          </UL>
          <P>
            Automated vulnerability scanning runs on every code change and on a
            weekly schedule via GitHub Dependabot and npm audit.
          </P>

          <H3>End-of-Life Software Management</H3>
          <P>
            We actively monitor all software dependencies for end-of-life (EOL)
            status. Our EOL monitoring covers Node.js, Next.js, React, TypeScript,
            and all third-party packages. Software approaching EOL is flagged for
            upgrade, and EOL software is prioritized for immediate replacement.
          </P>
        </Section>

        {/* 3. Information Security Policy */}
        <Section title="Information Security Policy" icon="📋">
          <P>
            Our Information Security Policy (ISP) governs how we protect the
            confidentiality, integrity, and availability of all information
            processed by the platform:
          </P>
          <UL>
            <LI>
              Regular review of access controls and permissions (quarterly)
            </LI>
            <LI>
              Secure credential management using environment variables and
              encrypted secret storage
            </LI>
            <LI>
              Incident response procedures for security events
            </LI>
            <LI>
              Ongoing evaluation and improvement of security practices
            </LI>
            <LI>
              Comprehensive audit logging of all security-relevant events
            </LI>
            <LI>
              Security awareness and best practices for all personnel
            </LI>
          </UL>
          <P>
            For security inquiries or to report a vulnerability, contact:{" "}
            <strong>shopcolby@gmail.com</strong>
          </P>
        </Section>

        {/* 4. Access Control Policy */}
        <Section title="Access Control Policy" icon="🔑">
          <H3>Defined Access Controls</H3>
          <P>
            Access to the platform and restaurant data is governed by a defined
            access control policy based on the principle of least privilege:
          </P>
          <UL>
            <LI>
              <strong>Role-Based Access Control (RBAC):</strong> Every user is
              assigned a role (Owner or Manager) that determines what features
              and data they can access.
            </LI>
            <LI>
              <strong>Owner Role:</strong> Full access to all features including
              financial data, settings, team management, bank connections, and
              security settings.
            </LI>
            <LI>
              <strong>Manager Role:</strong> Limited access to operational
              features. No access to financial data, bank connections, or
              administrative settings.
            </LI>
          </UL>

          <H3>Centralized Identity & Access Management</H3>
          <P>
            All user authentication and authorization is managed through a single
            centralized system. There are no separate or fragmented identity
            systems. User sessions, roles, and permissions are all managed from
            one place with full audit trail.
          </P>

          <H3>Periodic Access Reviews</H3>
          <P>
            We conduct regular access reviews to ensure users have appropriate
            levels of access:
          </P>
          <UL>
            <LI>
              All user access is reviewed quarterly by the restaurant owner
            </LI>
            <LI>
              Audit logs are reviewed monthly for unauthorized access attempts
            </LI>
            <LI>
              Third-party service access (Plaid, Square, etc.) is reviewed
              quarterly and unnecessary permissions are revoked
            </LI>
          </UL>

          <H3>Employee De-provisioning</H3>
          <P>
            When a team member leaves or changes roles, their access is modified
            or revoked immediately:
          </P>
          <UL>
            <LI>
              <strong>Immediate deactivation:</strong> Account is soft-deleted
              (deactivated) instantly when removed by the owner
            </LI>
            <LI>
              <strong>Credential clearing:</strong> All login credentials (PIN,
              MFA) are automatically cleared upon deactivation
            </LI>
            <LI>
              <strong>Session invalidation:</strong> Active sessions are ended
              when access is revoked
            </LI>
            <LI>
              <strong>Audit trail:</strong> All access changes are logged with
              timestamps and the identity of the person making the change
            </LI>
          </UL>
        </Section>

        {/* 5. Zero Trust Architecture */}
        <Section title="Zero Trust Security" icon="🏛️">
          <P>
            Our platform implements a zero trust security model where no user
            or request is trusted by default:
          </P>
          <UL>
            <LI>
              <strong>Verify every request:</strong> Every API call and page
              navigation is authenticated and authorized through middleware
            </LI>
            <LI>
              <strong>Multi-factor authentication:</strong> Available for all
              accounts to add an extra layer of verification beyond passwords
            </LI>
            <LI>
              <strong>Session expiration:</strong> Sessions automatically expire
              after 24 hours, requiring re-authentication
            </LI>
            <LI>
              <strong>Security headers:</strong> Strict Transport Security (HSTS),
              X-Frame-Options, Content-Type-Options, and Referrer-Policy headers
              are enforced on all responses
            </LI>
            <LI>
              <strong>Encrypted connections only:</strong> All communication uses
              HTTPS/TLS — unencrypted connections are never accepted
            </LI>
            <LI>
              <strong>Least privilege:</strong> Users can only access the specific
              resources and data their role permits
            </LI>
          </UL>
        </Section>

        {/* 6. Bank Connection (Plaid) */}
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

        {/* 7. User Consent */}
        <Section title="Your Consent" icon="✅">
          <P>
            We believe in transparent data practices. All consent is explicitly
            obtained, tracked, and auditable:
          </P>
          <UL>
            <LI>
              <strong>Account Creation:</strong> By creating an account, you
              consent to the collection and processing of the data described in
              this policy. This consent is recorded with a timestamp.
            </LI>
            <LI>
              <strong>Bank Connection:</strong> When you connect your bank
              account, you explicitly authorize access through Plaid&apos;s secure
              consent flow. This consent event is tracked separately.
            </LI>
            <LI>
              <strong>AI Features:</strong> Transaction categorization, recipe
              analysis, and menu optimization are performed automatically to
              improve your experience. You review and approve all AI suggestions.
            </LI>
            <LI>
              <strong>Consent Records:</strong> All consent grants and
              revocations are stored in a permanent record with timestamps
              and IP addresses for compliance and auditability.
            </LI>
            <LI>
              <strong>Withdrawal:</strong> You may withdraw consent at any time.
              Withdrawing consent for bank access disconnects your account
              immediately.
            </LI>
          </UL>
        </Section>

        {/* 8. Data Retention & Deletion */}
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

        {/* 9. Authentication & MFA */}
        <Section title="Authentication & MFA" icon="🔐">
          <P>
            We implement multiple layers of authentication to protect your
            account and restaurant data:
          </P>
          <UL>
            <LI>
              <strong>Password security:</strong> All passwords are stored using
              bcrypt hashing — we never store plain-text passwords
            </LI>
            <LI>
              <strong>PIN-based login:</strong> Team members can use secure
              numeric PINs for quick access, stored with bcrypt hashing
            </LI>
            <LI>
              <strong>Multi-factor authentication (MFA):</strong> TOTP-based
              two-factor authentication using authenticator apps (Google
              Authenticator, Authy, etc.) is available when enabled
            </LI>
            <LI>
              <strong>Session management:</strong> Secure encrypted JWT tokens with
              automatic expiration after 24 hours
            </LI>
            <LI>
              <strong>Rate limiting:</strong> Failed login and PIN attempts are
              rate-limited to prevent brute force attacks
            </LI>
            <LI>
              <strong>Bank connection protection:</strong> Financial features
              are only accessible to fully authenticated owner accounts
            </LI>
          </UL>
        </Section>

        {/* 10. Contact */}
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
