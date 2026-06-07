/**
 * Publishing Status Page
 * Shows the live submission feed for app store publishing
 */

import { useParams, useNavigate } from 'react-router-dom';
import { SubmissionLiveFeed } from '@/components/publishing/SubmissionLiveFeed';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const PublishingStatus = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Invalid Session</h1>
          <Button onClick={() => navigate('/dashboard')}>
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-16 bg-card/80 backdrop-blur-2xl flex items-center justify-between px-6 border-b border-border">
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard')}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Button>
        <h1 className="text-lg font-semibold">Publishing Status</h1>
        <div className="w-32" /> {/* Spacer for centering */}
      </header>

      {/* Main Content */}
      <main className="container max-w-6xl mx-auto py-8 px-6">
        <SubmissionLiveFeed
          sessionId={sessionId}
          onComplete={() => {
            // Optionally redirect or show success message when approved
            console.log('App approved and live!');
          }}
        />
      </main>
    </div>
  );
};

export default PublishingStatus;
