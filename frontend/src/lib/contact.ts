/**
 * Contact Form Service
 */

import { apiClient } from './api';

export interface ContactRequest {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface ContactResponse {
  success: boolean;
  message: string;
}

export class ContactService {
  async submitContactForm(data: ContactRequest): Promise<ContactResponse> {
    const response = await apiClient.post<ContactResponse>('/api/v1/contact', data);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to send message');
  }
}

export const contactService = new ContactService();
