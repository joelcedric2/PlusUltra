/**
 * Contact Form Routes
 * Handles contact form submissions
 */

import { FastifyInstance } from 'fastify';

// Stub functions for email sending - implement with actual email service
async function sendContactFormNotification(name: string, email: string, subject: string, message: string): Promise<boolean> {
  console.log(`[Contact] Notification: ${name} (${email}) - ${subject}`);
  return true;
}

async function sendUserConfirmationEmail(email: string, name: string): Promise<boolean> {
  console.log(`[Contact] Confirmation sent to ${email}`);
  return true;
}

interface ContactFormBody {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export async function contactRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/contact
   * Submit a contact form
   */
  fastify.post<{ Body: ContactFormBody }>('/api/v1/contact', async (request, reply) => {
    const { name, email, subject, message } = request.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid email address'
      });
    }

    try {
      // Send notification to support team
      const notificationSent = await sendContactFormNotification(name, email, subject, message);

      // Send confirmation email to user
      const confirmationSent = await sendUserConfirmationEmail(email, name);

      if (!notificationSent) {
        fastify.log.warn('Contact form notification email could not be sent. Check EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD in .env');
      }
      if (!confirmationSent) {
        fastify.log.warn('Contact form user confirmation email could not be sent. Check EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD in .env');
      }

      return reply.send({
        success: true,
        data: {
          success: true,
          message: 'Your message has been received. We will get back to you soon!'
        }
      });
    } catch (error) {
      fastify.log.error({ error }, 'Failed to process contact form');
      return reply.status(500).send({
        success: false,
        error: 'Failed to send message. Please try again later.'
      });
    }
  });
}
