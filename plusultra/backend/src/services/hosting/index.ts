/**
 * Hosting Services
 * Provides subdomain hosting capabilities for deployed apps and websites
 */

export { SubdomainHostingService } from './SubdomainHostingService';
export type {
  DeploymentType,
  DeploymentStatus,
  DeploymentConfig,
  Deployment,
  DeploymentVersion,
  DeploymentResult,
  CustomDomainResult,
  ListDeploymentsOptions,
  R2StorageConfig,
} from './SubdomainHostingService';

export { DNSManager } from './DNSManager';
export type {
  DNSRecordType,
  DNSRecord,
  DNSRecordResponse,
  SSLCertificateStatus,
  CustomHostnameConfig,
  CustomHostnameResponse,
  WildcardCertConfig,
  DNSManagerConfig,
} from './DNSManager';
