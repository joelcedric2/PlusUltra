/**
 * Backend Connection Status Indicator
 * Shows current backend connection status in workspace header
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Database, Plus, Settings, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { BackendIntegrationWizard, BackendConnection } from './BackendIntegrationWizard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface BackendConnectionStatusProps {
  projectId: string;
}

export const BackendConnectionStatus: React.FC<BackendConnectionStatusProps> = ({ projectId }) => {
  const api = useApi();
  const { toast } = useToast();
  const [connections, setConnections] = useState<BackendConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<BackendConnection | null>(null);

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ success: boolean; data: BackendConnection[] }>(
        `/api/v1/backend/connections/${projectId}`
      );

      if (response.success) {
        setConnections(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch backend connections:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, [projectId]);

  const handleConnectionCreated = (connection: BackendConnection) => {
    setConnections((prev) => [...prev, connection]);
    setWizardOpen(false);
  };

  const handleDeleteConnection = async () => {
    if (!connectionToDelete) return;

    try {
      const response = await api.delete<{ success: boolean; message: string }>(
        `/api/v1/backend/connections/${connectionToDelete.id}`
      );

      if (response.success) {
        setConnections((prev) => prev.filter((conn) => conn.id !== connectionToDelete.id));
        toast({
          title: 'Connection Deleted',
          description: `${connectionToDelete.connectionName} has been removed`,
        });
      }
    } catch (error) {
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Could not delete connection',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setConnectionToDelete(null);
    }
  };

  const confirmDelete = (connection: BackendConnection) => {
    setConnectionToDelete(connection);
    setDeleteDialogOpen(true);
  };

  const getStatusIcon = (status: BackendConnection['status']) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      default:
        return <AlertCircle className="w-3 h-3 text-gray-500" />;
    }
  };

  const getStatusVariant = (status: BackendConnection['status']): 'default' | 'destructive' | 'secondary' => {
    switch (status) {
      case 'connected':
        return 'default';
      case 'error':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const primaryConnection = connections.length > 0 ? connections[0] : null;

  if (loading) {
    return (
      <Button variant="ghost" size="sm" disabled className="gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">Loading...</span>
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Database className="w-4 h-4" />
            {primaryConnection ? (
              <>
                <span className="text-xs">{primaryConnection.provider}</span>
                <Badge variant={getStatusVariant(primaryConnection.status)} className="h-5 px-1.5">
                  {getStatusIcon(primaryConnection.status)}
                </Badge>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">No Backend</span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Backend Connections</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {connections.length === 0 ? (
            <div className="px-2 py-6 text-center">
              <Database className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground mb-3">No backend connected</p>
              <Button onClick={() => setWizardOpen(true)} size="sm" className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Connect Backend
              </Button>
            </div>
          ) : (
            <>
              <div className="px-2 py-2 space-y-2">
                {connections.map((connection) => (
                  <div
                    key={connection.id}
                    className="flex items-start justify-between p-2 rounded-md hover:bg-accent"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">
                          {connection.connectionName}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {connection.provider}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={getStatusVariant(connection.status)} className="text-xs">
                          {getStatusIcon(connection.status)}
                          <span className="ml-1">
                            {connection.status === 'connected' ? 'Connected' : 'Error'}
                          </span>
                        </Badge>
                        {connection.schema && (
                          <span className="text-xs text-muted-foreground">
                            {connection.schema.tables.length} tables
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(connection);
                      }}
                      className="text-muted-foreground hover:text-destructive ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => setWizardOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Another Backend
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <BackendIntegrationWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        projectId={projectId}
        onConnectionCreated={handleConnectionCreated}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backend Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the connection to{' '}
              <strong>{connectionToDelete?.connectionName}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConnection} className="bg-destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
