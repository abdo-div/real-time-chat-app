// utils/email.js
import { createTransport } from "nodemailer";
import { htmlToText } from "html-to-text";

export default class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.name.split(" ")[0]; // Grabs just "John" from "John Doe"
    this.url = url;
    this.from = `NexRide Support <${process.env.EMAIL_FROM || "support@nexride.com"}>`;
  }

  newTransport() {
    if (process.env.NODE_ENV === "production") {
      // Production Server Transport Gateway (SendGrid)
      return createTransport({
        service: "SendGrid",
        auth: {
          user: process.env.SENDGRID_USERNAME,
          pass: process.env.SENDGRID_PASSWORD,
        },
      });
    }

    // Local Development Sandbox Transport Gateway (Mailtrap)
    return createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  // Build HTML content based on template type
  buildHtml(template) {
    if (template === "passwordReset") {
      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>NexRide — Password Reset</title>
        </head>
        <body style="margin:0;padding:0;background:#f6f8fa;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fa;padding:40px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
                  <!-- Header -->
                  <tr>
                    <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:40px 40px 30px;text-align:center;">
                      <h1 style="color:#e94560;margin:0;font-size:28px;letter-spacing:2px;">NEX<span style="color:#ffffff;">RIDE</span></h1>
                      <p style="color:#a0aec0;margin:8px 0 0;font-size:13px;letter-spacing:1px;">PREMIUM CAR RENTAL</p>
                    </td>
                  </tr>
                  <!-- Body -->
                  <tr>
                    <td style="padding:40px;">
                      <h2 style="color:#1a1a2e;margin:0 0 16px;font-size:22px;">Password Reset Request</h2>
                      <p style="color:#4a5568;line-height:1.7;margin:0 0 16px;">Hello <strong>${this.firstName}</strong>,</p>
                      <p style="color:#4a5568;line-height:1.7;margin:0 0 24px;">
                        We received a request to reset the password for your NexRide account.
                        To proceed, send a <strong>PATCH</strong> request with your new <code style="background:#f0f4f8;padding:2px 6px;border-radius:4px;">password</code>
                        and <code style="background:#f0f4f8;padding:2px 6px;border-radius:4px;">passwordConfirm</code> to the URL below:
                      </p>
                      <!-- Reset URL Box -->
                      <div style="background:#f0f4f8;border-left:4px solid #e94560;border-radius:4px;padding:16px;margin:0 0 24px;word-break:break-all;">
                        <p style="margin:0;font-size:13px;color:#2d3748;font-family:monospace;">${this.url}</p>
                      </div>
                      <!-- Postman tip -->
                      <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:16px;margin:0 0 24px;">
                        <p style="margin:0;color:#795548;font-size:13px;line-height:1.6;">
                          💡 <strong>Testing with Postman?</strong><br/>
                          Method: <strong>PATCH</strong><br/>
                          URL: <code style="background:rgba(0,0,0,0.06);padding:2px 6px;border-radius:3px;">${this.url}</code><br/>
                          Body (JSON): <code style="background:rgba(0,0,0,0.06);padding:2px 6px;border-radius:3px;">{ "password": "...", "passwordConfirm": "..." }</code>
                        </p>
                      </div>
                      <p style="color:#718096;font-size:13px;line-height:1.7;margin:0 0 8px;">
                        ⏰ This link is valid for <strong>10 minutes only</strong>.
                      </p>
                      <p style="color:#718096;font-size:13px;line-height:1.7;margin:0;">
                        If you didn't request a password reset, please ignore this email — your account remains secure.
                      </p>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="background:#f6f8fa;padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
                      <p style="color:#a0aec0;font-size:12px;margin:0;">© ${new Date().getFullYear()} NexRide. All rights reserved.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
    }

    // Welcome template
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Welcome to !</title>
      </head>
      <body style="margin:0;padding:0;background:#f6f8fa;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fa;padding:40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
                <!-- Header -->
                <tr>
                  <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:40px 40px 30px;text-align:center;">
                    <h1 style="color:#e94560;margin:0;font-size:28px;letter-spacing:2px;">NEX<span style="color:#ffffff;">RIDE</span></h1>
                    <p style="color:#a0aec0;margin:8px 0 0;font-size:13px;letter-spacing:1px;">PREMIUM CAR RENTAL</p>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:40px;">
                    <h2 style="color:#1a1a2e;margin:0 0 16px;font-size:22px;">Welcome aboard! 🏎️</h2>
                    <p style="color:#4a5568;line-height:1.7;margin:0 0 16px;">Hello <strong>${this.firstName}</strong>,</p>
                    <p style="color:#4a5568;line-height:1.7;margin:0 0 24px;">
                      We're thrilled to have you as part of the NexRide family! Explore our premium fleet and book your perfect ride today.
                    </p>
                    <a href="${this.url}" style="display:inline-block;background:linear-gradient(135deg,#e94560,#c0392b);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;font-size:15px;">
                      Go to My Profile →
                    </a>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background:#f6f8fa;padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
                    <p style="color:#a0aec0;font-size:12px;margin:0;">© ${new Date().getFullYear()} NexRide. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  // Master Sender Core Engine
  async send(template, subject) {
    // 1) Build HTML body based on the requested template type
    const html = this.buildHtml(template);

    // 2) Package the payload bundle
    const mailOptions = {
      from: this.from,
      to: this.to,
      subject,
      html,
      text: htmlToText(html, { wordwrap: false }),
    };

    // 3) Fire the message through the calculated active transport pipeline
    await this.newTransport().sendMail(mailOptions);
  }

  // Custom User Event Channels
  async sendWelcome() {
    await this.send("welcome", "Welcome to the NexRide Family! 🏎️");
  }

  async sendPasswordReset() {
    await this.send(
      "passwordReset",
      "Your NexRide Password Reset Link (valid for 10 minutes)",
    );
  }
}
