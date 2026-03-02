import React from 'react';
import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      {/* Nav */}
      <nav style={styles.nav}>
        <div className="container flex items-center justify-between" style={{ height: 72 }}>
          <Link to="/" className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <span style={{ fontSize: '1.5rem' }}>⚡</span>
            <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>ZapCodes</span>
          </Link>
          <Link to="/" className="btn btn-ghost">← Back to Home</Link>
        </div>
      </nav>

      <section style={styles.content}>
        <div className="container" style={{ maxWidth: 800 }}>
          <h1 style={styles.title}>Privacy Policy</h1>
          <p style={styles.effective}>Effective Date: January 1, 2026 &nbsp;|&nbsp; Last Updated: February 25, 2026</p>

          <div style={styles.body}>
            <p>
              ZapCodes ("we," "us," or "our") operates the ZapCodes platform, including our website, API, and mobile application (collectively, the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. This policy is governed by the laws of the State of California, United States, including the California Consumer Privacy Act (CCPA) as amended by the California Privacy Rights Act (CPRA).
            </p>
            <p>
              By accessing or using the Service, you agree to this Privacy Policy. If you do not agree, please do not use the Service.
            </p>

            <h2 style={styles.heading}>1. Information We Collect</h2>
            <p><strong style={styles.strong}>1.1 Information You Provide Directly</strong></p>
            <p>
              When you create an account, we collect your name, email address, and password (stored in hashed form). If you authenticate via GitHub or Google OAuth, we receive your public profile information (name, email, avatar) from those services. If you subscribe to a paid plan, payment processing is handled by Stripe, Inc. We do not store your credit card numbers on our servers.
            </p>
            <p><strong style={styles.strong}>1.2 Information Collected Automatically</strong></p>
            <p>
              When you use the Service, we may automatically collect: IP address, browser type and version, device type and operating system, pages visited and time spent, referring URLs, and usage patterns within the Service. We use this information to improve performance, diagnose issues, and analyze usage trends.
            </p>
            <p><strong style={styles.strong}>1.3 Repository Data</strong></p>
            <p>
              When you submit a GitHub repository URL for scanning, we access the repository contents (source code files) solely for the purpose of performing the AI-powered code analysis you requested. We do not permanently store your source code. Repository data is processed in memory and discarded after scan results are generated. Scan results (issue descriptions, file locations, suggested fixes) are stored in our database to provide the Service.
            </p>
            <p><strong style={styles.strong}>1.4 GitHub Tokens</strong></p>
            <p>
              If you provide a GitHub personal access token for private repository access or automated fix submissions, it is stored in encrypted form in our database and is never exposed in API responses, logs, or to third parties.
            </p>

            <h2 style={styles.heading}>2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <p>
              Provide, operate, and maintain the Service; process your code scans and generate AI-powered analysis; create and manage your account; process payments and manage subscriptions; communicate with you about the Service, including updates, security alerts, and support messages; comply with legal obligations; detect, prevent, and address technical issues, fraud, and abuse; and improve and develop new features for the Service.
            </p>

            <h2 style={styles.heading}>3. How We Share Your Information</h2>
            <p>We do not sell your personal information. We may share information with:</p>
            <p>
              <strong style={styles.strong}>Service Providers:</strong> We use third-party services including MongoDB Atlas (database hosting), Stripe (payment processing), Groq (AI analysis), GitHub API (repository access), and Vercel/Render (hosting). These providers only access data necessary to perform their services and are bound by their own privacy policies.
            </p>
            <p>
              <strong style={styles.strong}>Legal Requirements:</strong> We may disclose your information if required by law, subpoena, court order, or governmental regulation, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.
            </p>
            <p>
              <strong style={styles.strong}>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will notify you of any such change.
            </p>

            <h2 style={styles.heading}>4. Your Rights Under California Law (CCPA/CPRA)</h2>
            <p>If you are a California resident, you have the following rights:</p>
            <p>
              <strong style={styles.strong}>Right to Know:</strong> You may request that we disclose the categories and specific pieces of personal information we have collected about you, the sources of that information, the business purpose for collecting it, and the third parties with whom we share it.
            </p>
            <p>
              <strong style={styles.strong}>Right to Delete:</strong> You may request the deletion of personal information we have collected from you, subject to certain exceptions provided by law.
            </p>
            <p>
              <strong style={styles.strong}>Right to Correct:</strong> You may request that we correct inaccurate personal information we maintain about you.
            </p>
            <p>
              <strong style={styles.strong}>Right to Opt Out of Sale/Sharing:</strong> We do not sell or share your personal information for cross-context behavioral advertising purposes.
            </p>
            <p>
              <strong style={styles.strong}>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising any of your privacy rights.
            </p>
            <p>
              To exercise any of these rights, please contact us at privacy@zapcodes.net. We will respond to verified requests within 45 days as required by law.
            </p>

            <h2 style={styles.heading}>5. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your information, including: encryption of data in transit (TLS/SSL) and at rest, hashed password storage using bcrypt, rate limiting and abuse prevention, secure token storage with restricted database access, and regular security reviews. However, no method of electronic transmission or storage is 100% secure. We cannot guarantee absolute security.
            </p>

            <h2 style={styles.heading}>6. Data Retention</h2>
            <p>
              We retain your personal information for as long as your account is active or as needed to provide the Service. If you delete your account, we will delete your personal information within 30 days, except where retention is required by law or for legitimate business purposes (such as fraud prevention).
            </p>

            <h2 style={styles.heading}>7. Children's Privacy</h2>
            <p>
              The Service is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we learn that we have collected personal information from a child under 13, we will take steps to delete that information promptly. If you believe a child under 13 has provided us with personal information, please contact us at privacy@zapcodes.net.
            </p>

            <h2 style={styles.heading}>8. Third-Party Links</h2>
            <p>
              The Service may contain links to third-party websites or services (such as GitHub, Stripe, and Google). We are not responsible for the privacy practices of these third parties. We encourage you to review their privacy policies before providing any personal information.
            </p>

            <h2 style={styles.heading}>9. International Users</h2>
            <p>
              The Service is operated from the United States. If you access the Service from outside the United States, your information may be transferred to and processed in the United States. By using the Service, you consent to this transfer.
            </p>

            <h2 style={styles.heading}>10. Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on the Service and updating the "Last Updated" date. Your continued use of the Service after changes constitutes acceptance of the updated policy.
            </p>

            <h2 style={styles.heading}>11. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, wish to exercise your California privacy rights, or have concerns about how your information is handled, please contact us at:
            </p>
            <p>
              ZapCodes<br />
              Email: privacy@zapcodes.net<br />
              State of Incorporation: California, United States
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <div className="container flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '1.2rem' }}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>ZapCodes</span>
          </div>
          <div className="flex items-center gap-2" style={{ gap: 24 }}>
            <Link to="/privacy" style={{ color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/terms" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Terms of Service</Link>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            ©2026 ZapCodes. AI-powered code repair. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}

const styles = {
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    background: 'rgba(6, 6, 11, 0.85)', backdropFilter: 'blur(16px)',
    borderBottom: '1px solid var(--border)',
  },
  content: {
    paddingTop: 120, paddingBottom: 80,
  },
  title: {
    fontSize: '2.5rem', fontWeight: 900, marginBottom: 8,
  },
  effective: {
    color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 40,
    borderBottom: '1px solid var(--border)', paddingBottom: 24,
  },
  body: {
    color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.8,
  },
  heading: {
    fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)',
    marginTop: 40, marginBottom: 16,
  },
  strong: {
    color: 'var(--text-primary)',
  },
  footer: {
    padding: '32px 0', borderTop: '1px solid var(--border)',
    position: 'relative', zIndex: 1,
  },
};
