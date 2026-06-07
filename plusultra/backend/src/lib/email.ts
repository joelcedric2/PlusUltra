import nodemailer from 'nodemailer';

const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT) : 587;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
const CONTACT_FORM_RECIPIENT = process.env.CONTACT_FORM_RECIPIENT || EMAIL_USER;

if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASSWORD) {
  console.warn('⚠️ Email credentials not fully set. Email sending will be skipped.');
}

const transporter = EMAIL_HOST && EMAIL_USER && EMAIL_PASSWORD
  ? nodemailer.createTransport({
      host: EMAIL_HOST,
      port: EMAIL_PORT,
      secure: EMAIL_PORT === 465, // true for 465, false for other ports
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false, // Allow self-signed certs in dev, use CA in prod
      },
    })
  : null;

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html: string,
  from: string = `PlusUltra Contact Form <${EMAIL_USER}>`
): Promise<boolean> {
  if (!transporter) {
    console.warn('Email transporter not configured. Skipping email send.');
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    console.log('Message sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

export async function sendContactFormNotification(
  name: string,
  email: string,
  subject: string,
  message: string
): Promise<boolean> {
  if (!CONTACT_FORM_RECIPIENT) {
    console.warn('CONTACT_FORM_RECIPIENT is not set. Cannot send contact form notification.');
    return false;
  }

  const emailSubject = `New Contact Form Submission: ${subject}`;
  const emailText = `
    Name: ${name}
    Email: ${email}
    Subject: ${subject}
    Message:
    ${message}
  `;
  const emailHtml = `
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Subject:</strong> ${subject}</p>
    <p><strong>Message:</strong></p>
    <p>${message.replace(/\n/g, '<br>')}</p>
  `;

  return sendEmail(CONTACT_FORM_RECIPIENT, emailSubject, emailText, emailHtml);
}

export async function sendUserConfirmationEmail(
  userEmail: string,
  userName: string
): Promise<boolean> {
  const emailSubject = 'Thank you for contacting PlusUltra!';
  const emailText = `
    Dear ${userName},

    Thank you for reaching out to us. We have received your message and will get back to you as soon as possible.

    Best regards,
    The PlusUltra Team
  `;
  const emailHtml = `
    <p>Dear ${userName},</p>
    <p>Thank you for reaching out to us. We have received your message and will get back to you as soon as possible.</p>
    <p>Best regards,</p>
    <p>The PlusUltra Team</p>
  `;

  return sendEmail(userEmail, emailSubject, emailText, emailHtml);
}
