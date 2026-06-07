/**
 * Revenue Share Agreement Modal
 * Commercial agreement for 2% revenue share on apps earning >$100k
 * This is NOT GDPR (privacy) - it's a business/commercial agreement
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DollarSign,
  TrendingUp,
  Download,
  AlertTriangle,
  CheckCircle,
  FileText,
  Info,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';

interface RevenueShareAgreementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  userId: string;
  onAgreementAccepted?: () => void;
}

export const RevenueShareAgreement: React.FC<RevenueShareAgreementProps> = ({
  open,
  onOpenChange,
  projectId,
  projectName,
  userId,
  onAgreementAccepted,
}) => {
  const api = useApi();
  const { toast } = useToast();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acknowledgedExportOption, setAcknowledgedExportOption] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAcceptAgreement = async () => {
    if (!acceptedTerms || !acknowledgedExportOption) {
      toast({
        title: 'Agreement Required',
        description: 'Please review and accept all terms to continue',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await api.post('/api/v1/revenue/accept-agreement', {
        userId,
        projectId,
        acceptedAt: new Date().toISOString(),
        version: '1.0',
      });

      toast({
        title: 'Agreement Accepted',
        description: 'You can now publish your app to the store',
      });

      if (onAgreementAccepted) {
        onAgreementAccepted();
      }

      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Failed to Save Agreement',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <DollarSign className="w-6 h-6 text-primary" />
            Revenue Share Agreement
          </DialogTitle>
          <DialogDescription>
            Commercial agreement for apps built and published using PlusUltra
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Key Terms Summary */}
            <Alert>
              <TrendingUp className="h-4 w-4" />
              <AlertDescription>
                <strong>Simple Terms:</strong> We only share in your success. If your app earns over
                $100,000 USD built and published through our platform, we receive 2% of gross revenue.
                Below $100k? No fees.
              </AlertDescription>
            </Alert>

            {/* Revenue Share Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Revenue Share Terms
              </h3>

              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium">2% Revenue Share</p>
                    <p className="text-sm text-muted-foreground">
                      Applies only to apps earning <strong>over $100,000 USD</strong> in gross revenue
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium">$100k Threshold</p>
                    <p className="text-sm text-muted-foreground">
                      Apps earning less than $100,000 USD have <strong>no revenue share obligations</strong>
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Built + Shipped Requirement</p>
                    <p className="text-sm text-muted-foreground">
                      Only applies to apps <strong>built AND published</strong> using PlusUltra's
                      platform and publishing tools
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Gross Revenue Basis</p>
                    <p className="text-sm text-muted-foreground">
                      Calculated on gross app revenue before platform fees (Apple/Google take their
                      cut first)
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Examples */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Examples</h3>
              <div className="grid gap-3">
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">App earning $50,000</span>
                    <Badge variant="secondary">No Share</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Below $100k threshold → <strong>$0 owed</strong> to PlusUltra
                  </p>
                </div>

                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">App earning $150,000</span>
                    <Badge variant="default">2% Share</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Above $100k threshold → <strong>$3,000/year</strong> (2% of $150k) to PlusUltra
                  </p>
                </div>

                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">App earning $500,000</span>
                    <Badge variant="default">2% Share</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Above $100k threshold → <strong>$10,000/year</strong> (2% of $500k) to PlusUltra
                  </p>
                </div>
              </div>
            </div>

            {/* Export Exemption */}
            <Alert variant="default" className="border-blue-500">
              <Download className="h-4 w-4 text-blue-500" />
              <AlertDescription>
                <strong className="text-blue-500">Export Code Exemption:</strong> If you export your
                project's source code and publish outside of PlusUltra's platform, this agreement does
                not apply. Revenue share only applies to apps published using our one-click deployment
                tools.
              </AlertDescription>
            </Alert>

            {/* Legal Notice */}
            <div className="border-l-4 border-primary pl-4 py-2 bg-primary/5">
              <p className="text-sm font-medium mb-2">Legal Notice</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This is a commercial revenue-sharing agreement, not a data privacy policy. By accepting,
                you agree that PlusUltra may track app revenue metrics solely for the purpose of
                calculating revenue share obligations. This tracking is limited to apps published through
                PlusUltra's platform and does not involve personal user data collection beyond what's
                necessary for commerce (sales figures, app ID).
              </p>
            </div>

            {/* Payment & Reporting */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Payment & Reporting</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>• Revenue calculated monthly based on App Store/Play Store reporting</p>
                <p>• Payment due within 30 days of end of quarter</p>
                <p>• You'll receive detailed revenue reports via email</p>
                <p>• Integration with Apple App Store Connect and Google Play Console for automated tracking</p>
                <p>• RevenueCat/AppFigures integration available for transparent revenue verification</p>
              </div>
            </div>

            {/* Consent Checkboxes */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="accept-terms"
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => setAcceptedTerms(checked as boolean)}
                />
                <label
                  htmlFor="accept-terms"
                  className="text-sm font-medium leading-relaxed cursor-pointer"
                >
                  I accept the Revenue Share Agreement and understand that if my app built and published
                  through PlusUltra earns over $100,000 USD, I agree to pay 2% of gross revenue to
                  PlusUltra. I understand apps earning less than $100k have no obligations.
                </label>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="acknowledge-export"
                  checked={acknowledgedExportOption}
                  onCheckedChange={(checked) => setAcknowledgedExportOption(checked as boolean)}
                />
                <label
                  htmlFor="acknowledge-export"
                  className="text-sm font-medium leading-relaxed cursor-pointer"
                >
                  I acknowledge that I can export my project's source code at any time, and if I publish
                  outside of PlusUltra's platform, this revenue share agreement does not apply.
                </label>
              </div>
            </div>

            {/* Warning */}
            {(!acceptedTerms || !acknowledgedExportOption) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You must accept both terms to continue publishing your app
                </AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="w-4 h-4" />
            <span>Agreement Version 1.0 - Effective Date: 2025</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAcceptAgreement}
              disabled={!acceptedTerms || !acknowledgedExportOption || isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Accept & Continue'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
