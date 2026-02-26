import React from 'react';
import { Link } from 'react-router-dom';

export default function Terms() {
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
          <h1 style={styles.title}>Terms of Service</h1>
          <p style={styles.effective}>Effective Date: January 1, 2026 &nbsp;|&nbsp; Last Updated: February 25, 2026</p>

          <div style={styles.body}>
            <p>
              Welcome to ZapCodes. These Terms of Service ("Terms") constitute a legally binding agreement between you ("you" or "User") and ZapCodes ("we," "us," "our," or the "Company"), governing your access to and use of the ZapCodes platform, website, API, and mobile application (collectively, the "Service"). Please read these Terms carefully before using the Service.
            </p>
            <p>
              By accessing or using the Service, you agree to be bound by these Terms. If you do not agree to these Terms, you must not access or use the Service.
            </p>

            <h2 style={styles.heading}>1. Eligibility</h2>
            <p>
              You must be at least 13 years of age to use the Service. If you are under 18, you represent that you have your parent's or legal guardian's consent to use the Service. By using the Service, you represent and warrant that you meet these eligibility requirements and have the legal capacity to enter into these Terms.
            </p>

            <h2 style={styles.heading}>2. Account Registration</h2>
            <p>
              To access certain features, you must create an account. You agree to provide accurate, current, and complete information during registration and to update such information as necessary. You are responsible for safeguarding your account credentials and for all activity that occurs under your account. You must notify us immediately of any unauthorized access to or use of your account. We reserve the right to suspend or terminate accounts that violate these Terms.
            </p>

            <h2 style={styles.heading}>3. Description of Service</h2>
            <p>
              ZapCodes provides an AI-powered code repair platform that enables users to scan GitHub repositories for software bugs, security vulnerabilities, performance issues, and other code defects. The Service uses artificial intelligence to analyze source code, identify potential issues, and generate suggested fixes. The Service may also create pull requests on GitHub on the user's behalf to apply suggested fixes ("Moltbot" functionality).
            </p>
            <p>
              The Service is provided on a best-effort basis. While we strive for accuracy, AI-generated code analysis and suggestions may contain errors. You are solely responsible for reviewing and testing any code changes before deploying them to production environments. ZapCodes is not liable for any damages arising from the use of AI-generated suggestions.
            </p>

            <h2 style={styles.heading}>4. Proprietary Rights and Intellectual Property</h2>
            <p style={{ background: 'rgba(0, 229, 160, 0.06)', border: '1px solid rgba(0, 229, 160, 0.2)', borderRadius: 8, padding: 20 }}>
              <strong style={styles.strong}>IMPORTANT — PLEASE READ CAREFULLY:</strong>
            </p>
            <p>
              <strong style={styles.strong}>4.1 Ownership of the Platform.</strong> The ZapCodes platform — including but not limited to its concept, design, architecture, source code, algorithms, AI models and pipelines, user interface, user experience, visual design, branding, logos, trade names, trade dress, documentation, APIs, data structures, business methods, workflows, and all related intellectual property — is the sole and exclusive property of ZapCodes and its owner(s). All rights, title, and interest in and to the Service are reserved.
            </p>
            <p>
              <strong style={styles.strong}>4.2 Copyright Protection.</strong> The Service and all of its components are protected by copyright laws of the United States (including under Title 17 of the United States Code), the laws of the State of California, and applicable international copyright treaties. Unauthorized reproduction, distribution, modification, public display, or creation of derivative works based on any part of the Service is strictly prohibited and constitutes copyright infringement.
            </p>
            <p>
              <strong style={styles.strong}>4.3 Prohibition on Copying, Cloning, or Replication.</strong> You are expressly prohibited from, and agree not to: (a) copy, clone, replicate, reverse-engineer, decompile, or disassemble the Service or any part thereof; (b) create any product, service, platform, application, or business that is substantially similar to, derived from, or based on the concept, design, functionality, or business model of ZapCodes; (c) scrape, crawl, harvest, or extract any data, content, code, or information from the Service for the purpose of building a competing or similar product; (d) use knowledge gained from the Service to develop a competing product or service; (e) reproduce the look, feel, user experience, or workflow of the Service in any other product or platform; or (f) assist, enable, or encourage any third party in doing any of the foregoing. Any violation of this section shall constitute a material breach of these Terms and may subject you to civil liability and damages, including but not limited to injunctive relief, statutory damages, and attorney's fees.
            </p>
            <p>
              <strong style={styles.strong}>4.4 Trade Secrets.</strong> The internal workings, algorithms, AI prompts, scanning methodologies, fix generation processes, and business processes of ZapCodes constitute trade secrets under the California Uniform Trade Secrets Act (Cal. Civ. Code § 3426 et seq.) and the federal Defend Trade Secrets Act (18 U.S.C. § 1836 et seq.). Unauthorized disclosure, misappropriation, or use of any trade secret information is strictly prohibited and will be prosecuted to the fullest extent of the law.
            </p>
            <p>
              <strong style={styles.strong}>4.5 Trademarks.</strong> "ZapCodes," the ZapCodes logo, "Moltbot," and all related names, logos, product and service names, designs, and slogans are trademarks of ZapCodes. You may not use these marks without the prior written permission of ZapCodes. All other trademarks not owned by ZapCodes that appear on the Service are the property of their respective owners.
            </p>
            <p>
              <strong style={styles.strong}>4.6 Your Code.</strong> You retain all ownership rights in the source code you submit for scanning. By submitting code to the Service, you grant ZapCodes a limited, temporary, non-exclusive license to access and analyze your code solely for the purpose of providing the Service. We do not claim ownership of your code and will not use, sell, or distribute it for any purpose other than providing the Service to you.
            </p>

            <h2 style={styles.heading}>5. Subscription Plans and Payments</h2>
            <p>
              The Service offers free and paid subscription plans. Paid plans are billed on a monthly recurring basis through Stripe. By subscribing to a paid plan, you authorize us to charge the applicable fees to your designated payment method. All fees are non-refundable except as required by applicable law. We reserve the right to change pricing with 30 days' advance notice. Free-tier usage is subject to limits as described on our pricing page.
            </p>

            <h2 style={styles.heading}>6. Acceptable Use</h2>
            <p>You agree not to use the Service to:</p>
            <p>
              Violate any applicable law, regulation, or third-party right; submit code you do not own or have authorization to scan; attempt to gain unauthorized access to the Service or its systems; interfere with or disrupt the Service or its infrastructure; use the Service for any malicious purpose, including scanning code to find exploits for unauthorized use; circumvent usage limits, rate limits, or access controls; resell, sublicense, or commercially redistribute the Service without authorization; or transmit any malware, viruses, or harmful code through the Service.
            </p>
            <p>
              We reserve the right to suspend or terminate your account for any violation of this section, without prior notice and without refund.
            </p>

            <h2 style={styles.heading}>7. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS. WE MAKE NO WARRANTY REGARDING THE ACCURACY, COMPLETENESS, OR RELIABILITY OF ANY AI-GENERATED CODE ANALYSIS, SUGGESTIONS, OR FIXES.
            </p>

            <h2 style={styles.heading}>8. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL ZAPCODES, ITS OWNERS, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO YOUR USE OF OR INABILITY TO USE THE SERVICE, REGARDLESS OF THE THEORY OF LIABILITY (CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR OTHERWISE), EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID TO US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED DOLLARS ($100.00 USD).
            </p>

            <h2 style={styles.heading}>9. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless ZapCodes and its owners, officers, employees, and agents from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorney's fees) arising out of or related to: (a) your use of the Service; (b) your violation of these Terms; (c) your violation of any applicable law or third-party right; or (d) any code you submit to the Service.
            </p>

            <h2 style={styles.heading}>10. Termination</h2>
            <p>
              We may terminate or suspend your access to the Service at any time, with or without cause, and with or without notice. Upon termination, your right to use the Service ceases immediately. Sections 4 (Proprietary Rights), 7 (Disclaimers), 8 (Limitation of Liability), 9 (Indemnification), 11 (Governing Law), and 12 (Dispute Resolution) shall survive termination.
            </p>

            <h2 style={styles.heading}>11. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of California, United States of America, without regard to its conflict of law provisions. Any legal action or proceeding arising out of or relating to these Terms shall be brought exclusively in the state or federal courts located in California, and you consent to the personal jurisdiction and venue of such courts.
            </p>

            <h2 style={styles.heading}>12. Dispute Resolution</h2>
            <p>
              <strong style={styles.strong}>12.1 Informal Resolution.</strong> Before filing any legal claim, you agree to attempt to resolve the dispute informally by contacting us at legal@zapcodes.net. We will attempt to resolve the dispute within 30 days.
            </p>
            <p>
              <strong style={styles.strong}>12.2 Arbitration.</strong> If the dispute is not resolved informally, it shall be resolved by binding arbitration in accordance with the rules of the American Arbitration Association (AAA), conducted in the State of California. The arbitrator's decision shall be final and binding. Judgment upon the award may be entered in any court of competent jurisdiction.
            </p>
            <p>
              <strong style={styles.strong}>12.3 Class Action Waiver.</strong> YOU AGREE THAT ANY DISPUTE RESOLUTION PROCEEDINGS WILL BE CONDUCTED ONLY ON AN INDIVIDUAL BASIS AND NOT IN A CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION. YOU WAIVE YOUR RIGHT TO PARTICIPATE IN A CLASS ACTION LAWSUIT OR CLASS-WIDE ARBITRATION.
            </p>
            <p>
              <strong style={styles.strong}>12.4 Injunctive Relief.</strong> Notwithstanding the foregoing, ZapCodes may seek injunctive or other equitable relief in any court of competent jurisdiction to protect its intellectual property rights, trade secrets, or proprietary information without the requirement of posting a bond.
            </p>

            <h2 style={styles.heading}>13. DMCA Notice</h2>
            <p>
              If you believe that any content on the Service infringes your copyright, please send a DMCA takedown notice to legal@zapcodes.net, including: a description of the copyrighted work claimed to have been infringed, identification of the infringing material and its location on the Service, your contact information, a statement of good faith belief that the use is not authorized, and a statement under penalty of perjury that the information is accurate and you are authorized to act on behalf of the copyright owner.
            </p>

            <h2 style={styles.heading}>14. Modifications to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. We will notify you of material changes by posting the updated Terms on the Service and updating the "Last Updated" date. Your continued use of the Service after the effective date of any changes constitutes your acceptance of the modified Terms. If you do not agree to the modified Terms, you must stop using the Service.
            </p>

            <h2 style={styles.heading}>15. Severability</h2>
            <p>
              If any provision of these Terms is held to be invalid, illegal, or unenforceable by a court of competent jurisdiction, such provision shall be enforced to the maximum extent permissible, and the remaining provisions shall continue in full force and effect.
            </p>

            <h2 style={styles.heading}>16. Entire Agreement</h2>
            <p>
              These Terms, together with our Privacy Policy, constitute the entire agreement between you and ZapCodes regarding the Service and supersede all prior agreements, representations, and understandings.
            </p>

            <h2 style={styles.heading}>17. Contact Us</h2>
            <p>
              If you have questions about these Terms of Service, please contact us at:
            </p>
            <p>
              ZapCodes<br />
              Email: legal@zapcodes.net<br />
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
            <Link to="/privacy" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/terms" style={{ color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'none' }}>Terms of Service</Link>
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
