import axios, { AxiosInstance } from 'axios';

/**
 * Cloudflare DNS Record Types
 */
export type DNSRecordType = 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS' | 'SRV' | 'CAA';

/**
 * DNS Record Configuration
 */
export interface DNSRecord {
  id?: string;
  type: DNSRecordType;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
  comment?: string;
}

/**
 * DNS Record Response from Cloudflare
 */
export interface DNSRecordResponse {
  id: string;
  type: DNSRecordType;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  created_on: string;
  modified_on: string;
  locked: boolean;
  zone_id: string;
  zone_name: string;
}

/**
 * SSL Certificate Status
 */
export interface SSLCertificateStatus {
  status: 'initializing' | 'pending_validation' | 'pending_issuance' | 'pending_deployment' | 'active' | 'deleted' | 'error';
  certificate_authority: string;
  validation_method: string;
  hosts: string[];
  expires_on?: string;
  issued_on?: string;
  error?: string;
}

/**
 * Custom Hostname Configuration
 */
export interface CustomHostnameConfig {
  hostname: string;
  ssl: {
    method: 'http' | 'txt' | 'email';
    type: 'dv' | 'ev' | 'ov';
    settings?: {
      min_tls_version?: '1.0' | '1.1' | '1.2' | '1.3';
      ciphers?: string[];
      early_hints?: 'on' | 'off';
    };
  };
  custom_origin_server?: string;
  custom_origin_sni?: string;
}

/**
 * Custom Hostname Response
 */
export interface CustomHostnameResponse {
  id: string;
  hostname: string;
  ssl: SSLCertificateStatus;
  status: 'active' | 'pending' | 'moved' | 'deleted' | 'pending_deletion';
  verification_errors?: string[];
  ownership_verification?: {
    type: 'txt' | 'http';
    name: string;
    value: string;
  };
  created_at: string;
  updated_at: string;
}

/**
 * Wildcard Certificate Configuration
 */
export interface WildcardCertConfig {
  zone_id: string;
  hosts: string[];
  type: 'universal' | 'dedicated' | 'dedicated-custom';
  validation_method: 'txt' | 'http' | 'email';
}

/**
 * DNS Manager Configuration
 */
export interface DNSManagerConfig {
  apiToken: string;
  zoneId: string;
  accountId?: string;
  baseUrl?: string;
}

/**
 * DNSManager
 * Manages DNS records and SSL certificates via Cloudflare API
 * Handles wildcard subdomain routing and custom domain configuration
 */
export class DNSManager {
  private client: AxiosInstance;
  private zoneId: string;
  private accountId?: string;

  constructor(config?: DNSManagerConfig) {
    const apiToken = config?.apiToken || process.env.CLOUDFLARE_API_TOKEN;
    this.zoneId = config?.zoneId || process.env.CLOUDFLARE_ZONE_ID || '';
    this.accountId = config?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!apiToken) {
      throw new Error('CLOUDFLARE_API_TOKEN is required');
    }

    if (!this.zoneId) {
      throw new Error('CLOUDFLARE_ZONE_ID is required');
    }

    this.client = axios.create({
      baseURL: config?.baseUrl || 'https://api.cloudflare.com/client/v4',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Create a new DNS record
   */
  async createDNSRecord(record: DNSRecord): Promise<DNSRecordResponse> {
    try {
      const response = await this.client.post(
        `/zones/${this.zoneId}/dns_records`,
        {
          type: record.type,
          name: record.name,
          content: record.content,
          ttl: record.ttl || 1, // 1 = auto
          proxied: record.proxied ?? true,
          priority: record.priority,
          comment: record.comment,
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.errors?.[0]?.message || 'Failed to create DNS record');
      }

      return response.data.result;
    } catch (error) {
      throw this.handleError(error, 'create DNS record');
    }
  }

  /**
   * Update an existing DNS record
   */
  async updateDNSRecord(recordId: string, record: Partial<DNSRecord>): Promise<DNSRecordResponse> {
    try {
      const response = await this.client.patch(
        `/zones/${this.zoneId}/dns_records/${recordId}`,
        {
          type: record.type,
          name: record.name,
          content: record.content,
          ttl: record.ttl,
          proxied: record.proxied,
          priority: record.priority,
          comment: record.comment,
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.errors?.[0]?.message || 'Failed to update DNS record');
      }

      return response.data.result;
    } catch (error) {
      throw this.handleError(error, 'update DNS record');
    }
  }

  /**
   * Delete a DNS record
   */
  async deleteDNSRecord(recordId: string): Promise<boolean> {
    try {
      const response = await this.client.delete(
        `/zones/${this.zoneId}/dns_records/${recordId}`
      );

      return response.data.success;
    } catch (error) {
      throw this.handleError(error, 'delete DNS record');
    }
  }

  /**
   * Get a DNS record by ID
   */
  async getDNSRecord(recordId: string): Promise<DNSRecordResponse> {
    try {
      const response = await this.client.get(
        `/zones/${this.zoneId}/dns_records/${recordId}`
      );

      if (!response.data.success) {
        throw new Error(response.data.errors?.[0]?.message || 'DNS record not found');
      }

      return response.data.result;
    } catch (error) {
      throw this.handleError(error, 'get DNS record');
    }
  }

  /**
   * List DNS records with optional filtering
   */
  async listDNSRecords(options?: {
    type?: DNSRecordType;
    name?: string;
    content?: string;
    page?: number;
    perPage?: number;
  }): Promise<{ records: DNSRecordResponse[]; totalCount: number }> {
    try {
      const params = new URLSearchParams();
      if (options?.type) params.append('type', options.type);
      if (options?.name) params.append('name', options.name);
      if (options?.content) params.append('content', options.content);
      params.append('page', String(options?.page || 1));
      params.append('per_page', String(options?.perPage || 100));

      const response = await this.client.get(
        `/zones/${this.zoneId}/dns_records?${params.toString()}`
      );

      if (!response.data.success) {
        throw new Error(response.data.errors?.[0]?.message || 'Failed to list DNS records');
      }

      return {
        records: response.data.result,
        totalCount: response.data.result_info?.total_count || response.data.result.length,
      };
    } catch (error) {
      throw this.handleError(error, 'list DNS records');
    }
  }

  /**
   * Find DNS record by name (exact match)
   */
  async findDNSRecordByName(name: string, type?: DNSRecordType): Promise<DNSRecordResponse | null> {
    const { records } = await this.listDNSRecords({ name, type });
    return records.find(r => r.name === name) || null;
  }

  /**
   * Create or update a DNS record (upsert)
   */
  async upsertDNSRecord(record: DNSRecord): Promise<DNSRecordResponse> {
    const existing = await this.findDNSRecordByName(record.name, record.type);

    if (existing) {
      return this.updateDNSRecord(existing.id, record);
    }

    return this.createDNSRecord(record);
  }

  /**
   * Setup wildcard subdomain routing
   * Creates a wildcard CNAME record pointing to the origin server
   */
  async setupWildcardSubdomain(
    subdomain: string,
    targetOrigin: string,
    options?: { proxied?: boolean; ttl?: number }
  ): Promise<DNSRecordResponse> {
    const wildcardName = `*.${subdomain}`;

    return this.upsertDNSRecord({
      type: 'CNAME',
      name: wildcardName,
      content: targetOrigin,
      proxied: options?.proxied ?? true,
      ttl: options?.ttl || 1,
      comment: `Wildcard subdomain routing for ${subdomain}`,
    });
  }

  /**
   * Setup specific subdomain record
   */
  async setupSubdomain(
    subdomain: string,
    targetOrigin: string,
    options?: { type?: 'A' | 'AAAA' | 'CNAME'; proxied?: boolean; ttl?: number }
  ): Promise<DNSRecordResponse> {
    return this.upsertDNSRecord({
      type: options?.type || 'CNAME',
      name: subdomain,
      content: targetOrigin,
      proxied: options?.proxied ?? true,
      ttl: options?.ttl || 1,
      comment: `Subdomain routing for ${subdomain}`,
    });
  }

  /**
   * Create a custom hostname for SSL for SaaS
   * Enables customers to use their own domains
   */
  async createCustomHostname(config: CustomHostnameConfig): Promise<CustomHostnameResponse> {
    try {
      const response = await this.client.post(
        `/zones/${this.zoneId}/custom_hostnames`,
        {
          hostname: config.hostname,
          ssl: {
            method: config.ssl.method,
            type: config.ssl.type,
            settings: config.ssl.settings,
          },
          custom_origin_server: config.custom_origin_server,
          custom_origin_sni: config.custom_origin_sni,
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.errors?.[0]?.message || 'Failed to create custom hostname');
      }

      return response.data.result;
    } catch (error) {
      throw this.handleError(error, 'create custom hostname');
    }
  }

  /**
   * Get custom hostname details
   */
  async getCustomHostname(hostnameId: string): Promise<CustomHostnameResponse> {
    try {
      const response = await this.client.get(
        `/zones/${this.zoneId}/custom_hostnames/${hostnameId}`
      );

      if (!response.data.success) {
        throw new Error(response.data.errors?.[0]?.message || 'Custom hostname not found');
      }

      return response.data.result;
    } catch (error) {
      throw this.handleError(error, 'get custom hostname');
    }
  }

  /**
   * List all custom hostnames
   */
  async listCustomHostnames(options?: {
    hostname?: string;
    page?: number;
    perPage?: number;
  }): Promise<{ hostnames: CustomHostnameResponse[]; totalCount: number }> {
    try {
      const params = new URLSearchParams();
      if (options?.hostname) params.append('hostname', options.hostname);
      params.append('page', String(options?.page || 1));
      params.append('per_page', String(options?.perPage || 50));

      const response = await this.client.get(
        `/zones/${this.zoneId}/custom_hostnames?${params.toString()}`
      );

      if (!response.data.success) {
        throw new Error(response.data.errors?.[0]?.message || 'Failed to list custom hostnames');
      }

      return {
        hostnames: response.data.result,
        totalCount: response.data.result_info?.total_count || response.data.result.length,
      };
    } catch (error) {
      throw this.handleError(error, 'list custom hostnames');
    }
  }

  /**
   * Delete a custom hostname
   */
  async deleteCustomHostname(hostnameId: string): Promise<boolean> {
    try {
      const response = await this.client.delete(
        `/zones/${this.zoneId}/custom_hostnames/${hostnameId}`
      );

      return response.data.success;
    } catch (error) {
      throw this.handleError(error, 'delete custom hostname');
    }
  }

  /**
   * Get SSL certificate status for the zone
   */
  async getSSLStatus(): Promise<{
    status: string;
    certificate_authority: string;
    hosts: string[];
    type: string;
  }> {
    try {
      const response = await this.client.get(
        `/zones/${this.zoneId}/ssl/certificate_packs`
      );

      if (!response.data.success) {
        throw new Error(response.data.errors?.[0]?.message || 'Failed to get SSL status');
      }

      const pack = response.data.result[0];
      return {
        status: pack?.status || 'none',
        certificate_authority: pack?.certificate_authority || 'unknown',
        hosts: pack?.hosts || [],
        type: pack?.type || 'unknown',
      };
    } catch (error) {
      throw this.handleError(error, 'get SSL status');
    }
  }

  /**
   * Order a dedicated SSL certificate
   */
  async orderSSLCertificate(hosts: string[], type: 'dedicated' | 'dedicated-custom' = 'dedicated'): Promise<{
    id: string;
    status: string;
    hosts: string[];
  }> {
    try {
      const response = await this.client.post(
        `/zones/${this.zoneId}/ssl/certificate_packs/order`,
        {
          type,
          hosts,
          validity_days: 365,
          certificate_authority: 'digicert',
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.errors?.[0]?.message || 'Failed to order SSL certificate');
      }

      return response.data.result;
    } catch (error) {
      throw this.handleError(error, 'order SSL certificate');
    }
  }

  /**
   * Verify domain ownership via TXT record
   */
  async createVerificationRecord(domain: string, verificationValue: string): Promise<DNSRecordResponse> {
    return this.createDNSRecord({
      type: 'TXT',
      name: `_verification.${domain}`,
      content: verificationValue,
      ttl: 300,
      proxied: false,
      comment: `Domain verification for ${domain}`,
    });
  }

  /**
   * Check if a subdomain is available (no existing records)
   */
  async isSubdomainAvailable(subdomain: string): Promise<boolean> {
    const existing = await this.findDNSRecordByName(subdomain);
    return !existing;
  }

  /**
   * Get CNAME verification instructions for custom domains
   */
  getCNAMEInstructions(customDomain: string, targetSubdomain: string): {
    recordType: 'CNAME';
    host: string;
    value: string;
    instructions: string;
  } {
    return {
      recordType: 'CNAME',
      host: customDomain.split('.')[0] || customDomain,
      value: targetSubdomain,
      instructions: `Add a CNAME record with host "${customDomain}" pointing to "${targetSubdomain}" in your DNS provider.`,
    };
  }

  /**
   * Purge Cloudflare cache for a specific URL pattern
   */
  async purgeCache(options: {
    files?: string[];
    tags?: string[];
    hosts?: string[];
    prefixes?: string[];
  }): Promise<boolean> {
    try {
      const response = await this.client.post(
        `/zones/${this.zoneId}/purge_cache`,
        options
      );

      return response.data.success;
    } catch (error) {
      throw this.handleError(error, 'purge cache');
    }
  }

  /**
   * Get zone details
   */
  async getZoneDetails(): Promise<{
    id: string;
    name: string;
    status: string;
    name_servers: string[];
    original_name_servers: string[];
    plan: {
      id: string;
      name: string;
    };
  }> {
    try {
      const response = await this.client.get(`/zones/${this.zoneId}`);

      if (!response.data.success) {
        throw new Error(response.data.errors?.[0]?.message || 'Failed to get zone details');
      }

      return response.data.result;
    } catch (error) {
      throw this.handleError(error, 'get zone details');
    }
  }

  /**
   * Handle API errors consistently
   */
  private handleError(error: unknown, operation: string): Error {
    const axiosError = error as { isAxiosError?: boolean; response?: { data?: { errors?: Array<{ code: string; message: string }> }; statusText?: string }; message?: string };
    if (axiosError.isAxiosError) {
      const cfErrors = axiosError.response?.data?.errors;
      if (cfErrors && cfErrors.length > 0) {
        const errorMessages = cfErrors.map((e) => `${e.code}: ${e.message}`).join(', ');
        return new Error(`Failed to ${operation}: ${errorMessages}`);
      }
      return new Error(`Failed to ${operation}: ${axiosError.response?.statusText || axiosError.message}`);
    }
    return error instanceof Error ? error : new Error(`Failed to ${operation}: Unknown error`);
  }
}

export default DNSManager;
