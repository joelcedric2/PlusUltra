/**
 * Backend Integration Wizard
 * Multi-step wizard for connecting projects to backend services
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Database,
  Cloud,
  CheckCircle,
  AlertCircle,
  Loader2,
  Copy,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';

export type BackendProvider = 'supabase' | 'aws' | 'azure' | 'firebase';

export interface BackendConnection {
  id: string;
  provider: BackendProvider;
  projectId: string;
  connectionName: string;
  config: Record<string, string>;
  schema?: DatabaseSchema;
  status: 'connected' | 'disconnected' | 'error';
  createdAt: Date;
  lastSync?: Date;
}

export interface DatabaseSchema {
  tables: DatabaseTable[];
  relationships: SchemaRelationship[];
}

export interface DatabaseTable {
  name: string;
  columns: DatabaseColumn[];
  primaryKey: string[];
}

export interface DatabaseColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
}

export interface SchemaRelationship {
  fromTable: string;
  toTable: string;
  fromColumn: string;
  toColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

interface BackendIntegrationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onConnectionCreated?: (connection: BackendConnection) => void;
}

type WizardStep = 'provider' | 'configure' | 'schema' | 'complete';

export const BackendIntegrationWizard: React.FC<BackendIntegrationWizardProps> = ({
  open,
  onOpenChange,
  projectId,
  onConnectionCreated,
}) => {
  const api = useApi();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<WizardStep>('provider');
  const [selectedProvider, setSelectedProvider] = useState<BackendProvider | null>(null);
  const [connectionName, setConnectionName] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [isGeneratingSchema, setIsGeneratingSchema] = useState(false);
  const [generatedSchema, setGeneratedSchema] = useState<DatabaseSchema | null>(null);
  const [connectionResult, setConnectionResult] = useState<BackendConnection | null>(null);

  const providers = [
    {
      id: 'supabase' as const,
      name: 'Supabase',
      description: 'Open-source Firebase alternative with PostgreSQL',
      icon: Database,
      popular: true,
    },
    {
      id: 'firebase' as const,
      name: 'Firebase',
      description: "Google's real-time database and backend platform",
      icon: Cloud,
      popular: true,
    },
    {
      id: 'aws' as const,
      name: 'AWS',
      description: 'Amazon Web Services (RDS, DynamoDB, Amplify)',
      icon: Cloud,
      popular: false,
    },
    {
      id: 'azure' as const,
      name: 'Azure',
      description: 'Microsoft Azure cloud services',
      icon: Cloud,
      popular: false,
    },
  ];

  const getProviderConfig = (provider: BackendProvider) => {
    switch (provider) {
      case 'supabase':
        return [
          { key: 'url', label: 'Supabase URL', placeholder: 'https://your-project.supabase.co', type: 'text' },
          { key: 'anonKey', label: 'Anon/Public Key', placeholder: 'eyJhbGci...', type: 'password' },
          { key: 'serviceKey', label: 'Service Role Key (Optional)', placeholder: 'eyJhbGci...', type: 'password' },
        ];
      case 'firebase':
        return [
          { key: 'apiKey', label: 'API Key', placeholder: 'AIzaSy...', type: 'password' },
          { key: 'authDomain', label: 'Auth Domain', placeholder: 'your-app.firebaseapp.com', type: 'text' },
          { key: 'projectId', label: 'Project ID', placeholder: 'your-project-id', type: 'text' },
          { key: 'storageBucket', label: 'Storage Bucket', placeholder: 'your-app.appspot.com', type: 'text' },
        ];
      case 'aws':
        return [
          { key: 'region', label: 'AWS Region', placeholder: 'us-east-1', type: 'text' },
          { key: 'accessKeyId', label: 'Access Key ID', placeholder: 'AKIA...', type: 'password' },
          { key: 'secretAccessKey', label: 'Secret Access Key', placeholder: 'wJalr...', type: 'password' },
          { key: 'service', label: 'Service Type', placeholder: 'rds | dynamodb | amplify', type: 'text' },
        ];
      case 'azure':
        return [
          { key: 'connectionString', label: 'Connection String', placeholder: 'Server=tcp:...', type: 'password' },
          { key: 'subscriptionId', label: 'Subscription ID', placeholder: 'xxxxxxxx-xxxx-xxxx...', type: 'text' },
          { key: 'resourceGroup', label: 'Resource Group', placeholder: 'my-resource-group', type: 'text' },
        ];
    }
  };

  const handleProviderSelect = (provider: BackendProvider) => {
    setSelectedProvider(provider);
    setConnectionName(`${provider}-${projectId.slice(0, 8)}`);
    setConfig({});
    setShowSecrets({});
    setCurrentStep('configure');
  };

  const handleConfigChange = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSecretVisibility = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const validateConfiguration = (): boolean => {
    if (!connectionName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Connection name is required',
        variant: 'destructive',
      });
      return false;
    }

    const providerConfig = getProviderConfig(selectedProvider!);
    const requiredFields = providerConfig.filter((field) => !field.label.includes('Optional'));

    for (const field of requiredFields) {
      if (!config[field.key]?.trim()) {
        toast({
          title: 'Validation Error',
          description: `${field.label} is required`,
          variant: 'destructive',
        });
        return false;
      }
    }

    return true;
  };

  const handleTestConnection = async () => {
    if (!validateConfiguration()) return;

    setIsConnecting(true);

    try {
      const response = await api.post<{ success: boolean; data: { valid: boolean; message: string } }>(
        '/api/v1/backend/test-connection',
        {
          provider: selectedProvider,
          config,
        }
      );

      if (response.data.valid) {
        toast({
          title: 'Connection Successful',
          description: 'Backend connection is working correctly',
        });
        setCurrentStep('schema');
      } else {
        toast({
          title: 'Connection Failed',
          description: response.data.message || 'Could not connect to backend service',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Connection Error',
        description: error instanceof Error ? error.message : 'Failed to test connection',
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleGenerateSchema = async () => {
    setIsGeneratingSchema(true);

    try {
      const response = await api.post<{ success: boolean; data: DatabaseSchema }>(
        '/api/v1/backend/generate-schema',
        {
          provider: selectedProvider,
          config,
        }
      );

      setGeneratedSchema(response.data);
      toast({
        title: 'Schema Generated',
        description: `Found ${response.data.tables.length} tables`,
      });
    } catch (error) {
      toast({
        title: 'Schema Generation Failed',
        description: error instanceof Error ? error.message : 'Could not generate schema',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingSchema(false);
    }
  };

  const handleCreateConnection = async () => {
    setIsConnecting(true);

    try {
      const response = await api.post<{ success: boolean; data: BackendConnection }>(
        '/api/v1/backend/connections',
        {
          projectId,
          provider: selectedProvider,
          connectionName,
          config,
          schema: generatedSchema,
        }
      );

      setConnectionResult(response.data);
      setCurrentStep('complete');

      toast({
        title: 'Backend Connected',
        description: `Successfully connected to ${selectedProvider}`,
      });

      if (onConnectionCreated) {
        onConnectionCreated(response.data);
      }
    } catch (error) {
      toast({
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Could not create connection',
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const resetWizard = () => {
    setCurrentStep('provider');
    setSelectedProvider(null);
    setConnectionName('');
    setConfig({});
    setShowSecrets({});
    setGeneratedSchema(null);
    setConnectionResult(null);
  };

  const handleClose = () => {
    resetWizard();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Backend Integration Wizard</DialogTitle>
          <DialogDescription>
            Connect your project to a backend service for database, authentication, and storage
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-12rem)] pr-4">
          {/* Provider Selection Step */}
          {currentStep === 'provider' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {providers.map((provider) => (
                  <Card
                    key={provider.id}
                    className={`cursor-pointer transition-all hover:border-primary ${
                      selectedProvider === provider.id ? 'border-primary bg-primary/5' : ''
                    }`}
                    onClick={() => handleProviderSelect(provider.id)}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <provider.icon className="w-8 h-8 text-primary mb-2" />
                        {provider.popular && <Badge variant="secondary">Popular</Badge>}
                      </div>
                      <CardTitle className="text-lg">{provider.name}</CardTitle>
                      <CardDescription className="text-sm">{provider.description}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Configuration Step */}
          {currentStep === 'configure' && selectedProvider && (
            <div className="space-y-6">
              <Alert>
                <Database className="h-4 w-4" />
                <AlertDescription>
                  Enter your {providers.find((p) => p.id === selectedProvider)?.name} credentials to
                  establish a connection
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="connectionName">Connection Name</Label>
                  <Input
                    id="connectionName"
                    value={connectionName}
                    onChange={(e) => setConnectionName(e.target.value)}
                    placeholder="e.g., production-db"
                  />
                </div>

                {getProviderConfig(selectedProvider).map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    <div className="relative">
                      <Input
                        id={field.key}
                        type={field.type === 'password' && !showSecrets[field.key] ? 'password' : 'text'}
                        value={config[field.key] || ''}
                        onChange={(e) => handleConfigChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="pr-10"
                      />
                      {field.type === 'password' && (
                        <button
                          type="button"
                          onClick={() => toggleSecretVisibility(field.key)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showSecrets[field.key] ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep('provider')}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleTestConnection} disabled={isConnecting}>
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      Test Connection
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Schema Generation Step */}
          {currentStep === 'schema' && (
            <div className="space-y-6">
              <Alert>
                <Sparkles className="h-4 w-4" />
                <AlertDescription>
                  Automatically generate TypeScript types and API routes based on your database schema
                </AlertDescription>
              </Alert>

              {!generatedSchema ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Generate Database Schema</CardTitle>
                    <CardDescription>
                      We'll inspect your database and create type-safe TypeScript interfaces
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={handleGenerateSchema} disabled={isGeneratingSchema} className="w-full">
                      {isGeneratingSchema ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating Schema...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate Schema
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Generated Schema</CardTitle>
                    <CardDescription>{generatedSchema.tables.length} tables found</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {generatedSchema.tables.map((table) => (
                        <div key={table.name} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">{table.name}</h4>
                            <Badge variant="outline">{table.columns.length} columns</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            {table.columns.slice(0, 5).map((col) => (
                              <div key={col.name} className="flex justify-between">
                                <span>{col.name}</span>
                                <span className="text-xs">{col.type}</span>
                              </div>
                            ))}
                            {table.columns.length > 5 && (
                              <div className="text-xs">... and {table.columns.length - 5} more</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep('configure')}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleCreateConnection} disabled={isConnecting || !generatedSchema}>
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      Complete Setup
                      <CheckCircle className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Complete Step */}
          {currentStep === 'complete' && connectionResult && (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center py-8">
                <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
                <h3 className="text-2xl font-bold mb-2">Backend Connected!</h3>
                <p className="text-muted-foreground text-center">
                  Your project is now connected to {selectedProvider}
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Connection Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Connection Name:</span>
                    <span className="font-medium">{connectionResult.connectionName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Provider:</span>
                    <Badge>{connectionResult.provider}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge variant="default">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Connected
                    </Badge>
                  </div>
                  {connectionResult.schema && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tables:</span>
                      <span className="font-medium">{connectionResult.schema.tables.length}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button onClick={handleClose} className="w-full">
                Done
              </Button>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
