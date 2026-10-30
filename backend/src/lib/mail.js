import nodemailer from "nodemailer";

// SMTP comes from backend/.env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM).
// Without SMTP_HOST, mail is printed to the server log instead of being sent.
const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

export async function sendMail({ to, subject, text }) {
  if (!transport) {
    console.log(`[mail] SMTP not configured. To: ${to}\nSubject: ${subject}\n${text}`);
    return;
  }
  await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
}
