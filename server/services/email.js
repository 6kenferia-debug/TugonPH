const nodemailer = require("nodemailer");

class EmailServiceNotConfiguredError extends Error {
  constructor() {
    super("Email OTP delivery is not configured. Set Gmail SMTP values in server/.env.");
    this.name = "EmailServiceNotConfiguredError";
    this.code = "EMAIL_SERVICE_NOT_CONFIGURED";
    this.status = 503;
  }
}

function getTransportConfig() {
  const host = process.env.EMAIL_HOST;
  const user = process.env.EMAIL_USER;
  const password = process.env.EMAIL_PASSWORD;
  const port = Number(process.env.EMAIL_PORT || 465);
  const secure = process.env.EMAIL_SECURE !== "false";

  if (!host || !user || !password) {
    throw new EmailServiceNotConfiguredError();
  }

  return {
    host,
    port,
    secure,
    auth: { user, pass: password },
    from: process.env.EMAIL_FROM || user,
  };
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatStatusLabel(value) {
  if (!value) return "Pending";
  return String(value)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function sendEmailMessage({ to, subject, text, html, deliveryLabel }) {
  try {
    const transporter = nodemailer.createTransport(getTransportConfig());
    const info = await transporter.sendMail({
      from: getTransportConfig().from,
      to,
      subject,
      text,
      html,
    });

    if (!info?.messageId) {
      throw new Error(`${deliveryLabel} was not accepted by the SMTP provider.`);
    }

    return info;
  } catch (error) {
    if (error && error.code === "EMAIL_SERVICE_NOT_CONFIGURED") {
      throw error;
    }
    console.error(`Failed to send ${deliveryLabel}:`, error);
    return null;
  }
}

async function sendVerificationCode(email, code) {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    const error = new Error("A valid email address is required to send the verification code.");
    error.status = 400;
    error.code = "INVALID_EMAIL";
    throw error;
  }

  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    const error = new Error("A valid 6-digit verification code is required.");
    error.status = 400;
    error.code = "INVALID_OTP";
    throw error;
  }

  try {
    const info = await sendEmailMessage({
      to: email,
      subject: "Your TugonPH verification code",
      text: `Your TugonPH verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 560px; margin: 0 auto;">
          <h2 style="margin-bottom: 12px; color: #0f172a;">TugonPH Verification</h2>
          <p>Hello,</p>
          <p>Use the following code to verify your TugonPH registration:</p>
          <div style="padding: 18px 20px; margin: 18px 0; border-radius: 10px; background: #eff6ff; border: 1px solid #bfdbfe; text-align: center; font-size: 30px; font-weight: 700; letter-spacing: 6px; color: #1d4ed8;">
            ${code}
          </div>
          <p>This code expires in 10 minutes.</p>
          <p>Do not share this code with anyone.</p>
        </div>
      `,
      deliveryLabel: "verification email",
    });

    if (!info) {
      const deliveryError = new Error("We could not send the verification email right now. Please try again in a few minutes.");
      deliveryError.status = 503;
      deliveryError.code = "EMAIL_DELIVERY_FAILED";
      throw deliveryError;
    }

    return info;
  } catch (error) {
    if (error && error.code === "EMAIL_SERVICE_NOT_CONFIGURED") {
      throw error;
    }
    const deliveryError = new Error("We could not send the verification email right now. Please try again in a few minutes.");
    deliveryError.status = 503;
    deliveryError.code = "EMAIL_DELIVERY_FAILED";
    throw deliveryError;
  }
}

async function sendStatusUpdateEmail({
  email,
  kind,
  title,
  referenceId,
  previousStatus,
  newStatus,
  adminNotes,
}) {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    console.warn(`Skipping ${kind} status email because the recipient email is invalid.`);
    return null;
  }

  const subject = kind === "complaint"
    ? "TugonPH - Your Complaint Status Has Been Updated"
    : "TugonPH - Your Assistance Request Status Has Been Updated";

  const itemLabel = kind === "complaint" ? "Complaint" : "Assistance request";
  const referenceLabel = referenceId ? String(referenceId) : "N/A";
  const previousLabel = previousStatus ? formatStatusLabel(previousStatus) : "Not available";
  const newLabel = formatStatusLabel(newStatus);
  const noteText = typeof adminNotes === "string" && adminNotes.trim() ? adminNotes.trim() : "";

  const text = [
    "Hello,",
    `Your ${kind === "complaint" ? "complaint" : "assistance request"} has been updated.`,
    `${itemLabel} reference: ${referenceLabel}`,
    `Previous status: ${previousLabel}`,
    `Current status: ${newLabel}`,
    noteText ? `Admin notes: ${noteText}` : "",
    "Please log in to TugonPH for more information.",
    "Thank you,",
    "TugonPH",
  ].filter(Boolean).join("\n\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 560px; margin: 0 auto;">
      <h2 style="margin-bottom: 12px; color: #0f172a;">TugonPH Status Update</h2>
      <p>Hello,</p>
      <p>Your ${itemLabel.toLowerCase()} has been updated.</p>
      <p><strong>Reference:</strong> ${escapeHtml(referenceLabel)}</p>
      <p><strong>Title:</strong> ${escapeHtml(title || "N/A")}</p>
      <p><strong>Previous status:</strong> ${escapeHtml(previousLabel)}</p>
      <p><strong>Current status:</strong> ${escapeHtml(newLabel)}</p>
      ${noteText ? `<p><strong>Admin notes:</strong> ${escapeHtml(noteText)}</p>` : ""}
      <p>Please log in to TugonPH for more information.</p>
      <p>Thank you,<br />TugonPH</p>
    </div>
  `;

  try {
    return await sendEmailMessage({
      to: email,
      subject,
      text,
      html,
      deliveryLabel: `${kind} status update email`,
    });
  } catch (error) {
    console.warn(`Unable to send ${kind} status email to ${email}:`, error.message || error);
    return null;
  }
}

module.exports = {
  sendVerificationCode,
  sendStatusUpdateEmail,
  EmailServiceNotConfiguredError,
};