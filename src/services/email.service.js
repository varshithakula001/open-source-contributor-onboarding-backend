import { env } from '../config/env.js';

class EmailService {
  constructor() {
    this.sentEmails = []; // For test inspection
    this.adapter = env.NODE_ENV === 'test' ? 'mock' : 'console';
  }

  /**
   * Overrides current delivery adapter (e.g. 'mock', 'console').
   */
  setAdapter(adapterName) {
    this.adapter = adapterName;
  }

  getSentEmails() {
    return [...this.sentEmails];
  }

  clearSentEmails() {
    this.sentEmails = [];
  }

  /**
   * Dispatches an email-verification message containing the raw token link.
   * NEVER exposed in HTTP responses.
   */
  async sendVerificationEmail({ to, token, name = 'Contributor' }) {
    if (!to || !token) {
      throw new Error('Recipient address and verification token are required.');
    }

    const verificationUrl = `${env.CLIENT_ORIGIN}/verify-email?token=${token}`;
    const message = {
      to,
      subject: 'Verify your Open Source Contributor Onboarding account',
      type: 'VERIFICATION',
      token, // Available only to the internal email delivery worker / test runner
      verificationUrl,
      timestamp: new Date().toISOString(),
    };

    return await this._deliver(message);
  }

  /**
   * Dispatches a password-reset message containing the raw token link.
   * NEVER exposed in HTTP responses.
   */
  async sendPasswordResetEmail({ to, token, name = 'User' }) {
    if (!to || !token) {
      throw new Error('Recipient address and reset token are required.');
    }

    const resetUrl = `${env.CLIENT_ORIGIN}/reset-password?token=${token}`;
    const message = {
      to,
      subject: 'Reset your Open Source Contributor Onboarding password',
      type: 'PASSWORD_RESET',
      token,
      resetUrl,
      timestamp: new Date().toISOString(),
    };

    return await this._deliver(message);
  }

  /**
   * Internal delivery dispatcher based on the active adapter.
   */
  async _deliver(message) {
    // 1. Mock adapter for unit/integration testing
    if (this.adapter === 'mock' || env.NODE_ENV === 'test') {
      this.sentEmails.push(message);
      return { success: true, mode: 'mock' };
    }

    // 2. Production safety check: fail safely if no delivery channel configured
    if (env.NODE_ENV === 'production') {
      // In production, real SMTP/API delivery must be configured
      throw new Error(
        'Production email delivery mechanism is not configured. Outbound verification emails cannot be dispatched.'
      );
    }

    // 3. Local Development adapter: console logging when enabled
    if (env.DEV_AUTH_TOKEN_LOGGING) {
      console.log(`\n================== 📨 LOCAL DEV EMAIL ==================`);
      console.log(`To: ${message.to}`);
      console.log(`Subject: ${message.subject}`);
      if (message.type === 'VERIFICATION') {
        console.log(`Verification URL: ${message.verificationUrl}`);
      } else {
        console.log(`Password Reset URL: ${message.resetUrl}`);
      }
      console.log(`========================================================\n`);
    } else {
      console.log(`📨 [DEV EMAIL] Prepared ${message.type} email for ${message.to} (token logging disabled).`);
    }

    this.sentEmails.push(message);
    return { success: true, mode: 'console' };
  }
}

export const emailService = new EmailService();
export default emailService;
