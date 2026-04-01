import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  family: 4,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

export async function sendAlertEmail({
  to,
  name,
  symbol,
  condition,
  threshold,
  predictedClose,
  predictedFor,
}) {
  const direction = condition === "above" ? "📈 above" : "📉 below";
  const isLive = predictedFor === "Live price";
  const subject = isLive
    ? `🚨 CryptoLSTM Alert: ${symbol} live price ${condition} $${threshold.toLocaleString()}`
    : `🚨 CryptoLSTM Alert: ${symbol} predicted ${condition} $${threshold.toLocaleString()}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #0b0f1a; color: #f1f5f9; padding: 32px; border-radius: 12px;">
      <h1 style="color: #818cf8; font-size: 24px; margin-bottom: 4px;">⬡ CryptoLSTM</h1>
      <p style="color: #94a3b8; margin-bottom: 24px;">Price Alert Triggered</p>

      <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0 0 4px;">Hi ${name},</p>
        <p style="font-size: 16px; margin: 0;">
  Your ${isLive ? '<strong style="color: #34d399;">live price</strong>' : '<strong style="color: #818cf8;">prediction</strong>'} alert for <strong style="color: #818cf8;">${symbol.replace("USDT", "/USDT")}</strong> has been triggered.
</p>
      </div>

      <div style="background: #1e1b4b; border: 1px solid rgba(99,102,241,0.3); border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
        <span style="color: #94a3b8; font-size: 13px;">${isLive ? "Live price" : "Predicted close"}</span>
        <strong style="color: #34d399; font-size: 18px;">$${predictedClose.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <span style="color: #94a3b8; font-size: 13px;">Your threshold</span>
          <strong style="color: #f1f5f9;">$${threshold.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <span style="color: #94a3b8; font-size: 13px;">Condition</span>
          <strong style="color: #f1f5f9;">${condition === "above" ? "Above" : "Below"} threshold</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8; font-size: 13px;">Alert type</span>
          <strong style="color: #f1f5f9;">${isLive ? "Live price alert" : "Prediction alert"}</strong>
        </div>
      </div>

      <p style="color: #94a3b8; font-size: 12px; text-align: center;">
        CryptoLSTM — Daily close prediction powered by LSTM
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `CryptoLSTM <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

export async function verifyMailer() {
  try {
    await transporter.verify();
    console.log("✅ Gmail mailer ready");
  } catch (err) {
    console.error("❌ Gmail mailer error:", err.message);
  }
}
