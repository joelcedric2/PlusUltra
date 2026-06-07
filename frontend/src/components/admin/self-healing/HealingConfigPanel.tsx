/**
 * Healing Configuration Panel
 *
 * Admin panel for configuring self-healing system settings,
 * thresholds, notification channels, and emergency controls.
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Power, Save, Shield } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface HealingConfig {
  enabled: boolean;
  autoHealProduction: boolean;
  autoHealStaging: boolean;
  minConfidence: number;
  maxAttemptsPerHour: number;
  maxAttemptsPerError: number;
  cooldownPeriod: number;
  notifyOnAttempt: boolean;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  notificationChannels: {
    slack?: {
      webhookUrl: string;
      channel?: string;
    };
    email?: {
      to: string[];
      from: string;
    };
    webhook?: {
      url: string;
    };
  };
  requireApproval: boolean;
  emergencyKillSwitch: boolean;
}

interface HealingConfigPanelProps {
  projectId: string;
}

export function HealingConfigPanel({ projectId }: HealingConfigPanelProps) {
  const [config, setConfig] = useState<HealingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchConfig = async () => {
    try {
      const response = await fetch(`/api/self-healing/config/${projectId}`);
      const data = await response.json();

      if (data.success) {
        setConfig(data.config);
      }
    } catch (error) {
      console.error('Failed to fetch healing config:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!config) return;

    try {
      setSaving(true);
      const response = await fetch(`/api/self-healing/config/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to save healing config:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleKillSwitch = async () => {
    if (!config) return;

    const newValue = !config.emergencyKillSwitch;

    try {
      const response = await fetch(`/api/self-healing/config/${projectId}/kill-switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newValue }),
      });

      const data = await response.json();

      if (data.success) {
        setConfig({ ...config, emergencyKillSwitch: newValue });
      }
    } catch (error) {
      console.error('Failed to toggle kill switch:', error);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [projectId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Self-Healing Configuration</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Self-Healing Configuration</CardTitle>
          <CardDescription>Failed to load configuration</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Emergency Kill Switch */}
      <Card className={config.emergencyKillSwitch ? 'border-destructive' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Power className="h-5 w-5" />
            Emergency Kill Switch
          </CardTitle>
          <CardDescription>
            {config.emergencyKillSwitch
              ? 'All self-healing is currently DISABLED'
              : 'Self-healing is currently active'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm">
                {config.emergencyKillSwitch
                  ? 'Enable self-healing to resume automatic error fixing'
                  : 'Disable all self-healing activities immediately'}
              </p>
            </div>
            <Button
              variant={config.emergencyKillSwitch ? 'default' : 'destructive'}
              onClick={toggleKillSwitch}
            >
              {config.emergencyKillSwitch ? (
                <>
                  <Power className="h-4 w-4 mr-2" />
                  Enable
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Disable
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>Basic self-healing configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="enabled">Enable Self-Healing</Label>
            <Switch
              id="enabled"
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="autoHealProduction">Auto-Heal Production</Label>
              <p className="text-xs text-muted-foreground">
                Automatically deploy fixes to production
              </p>
            </div>
            <Switch
              id="autoHealProduction"
              checked={config.autoHealProduction}
              onCheckedChange={(checked) =>
                setConfig({ ...config, autoHealProduction: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="autoHealStaging">Auto-Heal Staging</Label>
              <p className="text-xs text-muted-foreground">
                Automatically deploy fixes to staging
              </p>
            </div>
            <Switch
              id="autoHealStaging"
              checked={config.autoHealStaging}
              onCheckedChange={(checked) => setConfig({ ...config, autoHealStaging: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="requireApproval">Require Human Approval</Label>
              <p className="text-xs text-muted-foreground">
                All fixes require manual review before deployment
              </p>
            </div>
            <Switch
              id="requireApproval"
              checked={config.requireApproval}
              onCheckedChange={(checked) => setConfig({ ...config, requireApproval: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Thresholds & Limits */}
      <Card>
        <CardHeader>
          <CardTitle>Thresholds & Limits</CardTitle>
          <CardDescription>Safety thresholds and rate limits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="minConfidence">
              Minimum Confidence ({(config.minConfidence * 100).toFixed(0)}%)
            </Label>
            <Input
              id="minConfidence"
              type="range"
              min="50"
              max="100"
              step="5"
              value={config.minConfidence * 100}
              onChange={(e) =>
                setConfig({ ...config, minConfidence: parseInt(e.target.value) / 100 })
              }
            />
            <p className="text-xs text-muted-foreground">
              Fixes below this confidence threshold will require human review
            </p>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxAttemptsPerHour">Max Attempts per Hour</Label>
              <Input
                id="maxAttemptsPerHour"
                type="number"
                min="1"
                max="20"
                value={config.maxAttemptsPerHour}
                onChange={(e) =>
                  setConfig({ ...config, maxAttemptsPerHour: parseInt(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxAttemptsPerError">Max Attempts per Error</Label>
              <Input
                id="maxAttemptsPerError"
                type="number"
                min="1"
                max="10"
                value={config.maxAttemptsPerError}
                onChange={(e) =>
                  setConfig({ ...config, maxAttemptsPerError: parseInt(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cooldownPeriod">Cooldown Period (seconds)</Label>
            <Input
              id="cooldownPeriod"
              type="number"
              min="60"
              max="7200"
              step="60"
              value={config.cooldownPeriod}
              onChange={(e) => setConfig({ ...config, cooldownPeriod: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              Time to wait after multiple failures before retrying
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Configure notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="notifyOnAttempt">Notify on Attempt Started</Label>
            <Switch
              id="notifyOnAttempt"
              checked={config.notifyOnAttempt}
              onCheckedChange={(checked) => setConfig({ ...config, notifyOnAttempt: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="notifyOnSuccess">Notify on Success</Label>
            <Switch
              id="notifyOnSuccess"
              checked={config.notifyOnSuccess}
              onCheckedChange={(checked) => setConfig({ ...config, notifyOnSuccess: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="notifyOnFailure">Notify on Failure</Label>
            <Switch
              id="notifyOnFailure"
              checked={config.notifyOnFailure}
              onCheckedChange={(checked) => setConfig({ ...config, notifyOnFailure: checked })}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="slackWebhook">Slack Webhook URL</Label>
            <Input
              id="slackWebhook"
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={config.notificationChannels.slack?.webhookUrl || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  notificationChannels: {
                    ...config.notificationChannels,
                    slack: { ...config.notificationChannels.slack, webhookUrl: e.target.value },
                  },
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slackChannel">Slack Channel (optional)</Label>
            <Input
              id="slackChannel"
              placeholder="#alerts"
              value={config.notificationChannels.slack?.channel || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  notificationChannels: {
                    ...config.notificationChannels,
                    slack: { ...config.notificationChannels.slack, channel: e.target.value },
                  },
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="emailTo">Email Recipients (comma-separated)</Label>
            <Input
              id="emailTo"
              placeholder="admin@example.com, ops@example.com"
              value={config.notificationChannels.email?.to.join(', ') || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  notificationChannels: {
                    ...config.notificationChannels,
                    email: {
                      ...config.notificationChannels.email,
                      to: e.target.value.split(',').map((s) => s.trim()),
                    },
                  },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex items-center justify-between">
        {saved && (
          <Alert className="flex-1 mr-4">
            <Shield className="h-4 w-4" />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>Configuration updated successfully</AlertDescription>
          </Alert>
        )}
        <Button onClick={saveConfig} disabled={saving} className="ml-auto">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  );
}
