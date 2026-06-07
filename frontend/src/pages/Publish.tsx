import { LandingHeader } from "@/components/landing/LandingHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe, Apple, PlayCircle, ExternalLink, CheckCircle2, DollarSign, FileText } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const Publish = () => {
  const { toast } = useToast();
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  const handlePublish = (platform: string) => {
    setSelectedPlatform(platform);
    toast({
      title: "Coming Soon",
      description: `${platform} deployment will be available soon.`,
    });
  };

  const platforms = [
    {
      id: "web",
      title: "Publish as Web App",
      description: "Deploy your app to the web instantly with a custom domain",
      features: [
        "Instant deployment",
        "Custom domain support",
        "SSL certificate included",
        "Global CDN distribution",
        "Analytics included"
      ],
      requirements: [
        "No developer account needed",
        "Free tier available",
        "Deploy in seconds"
      ],
      docsUrl: "https://docs.lovable.dev/features/deployment",
      color: "from-blue-500 to-cyan-500",
      textStyle: "bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent font-bold drop-shadow-lg"
    },
    {
      id: "apple",
      title: "Publish to Apple Store",
      description: "Deploy your app to the iOS App Store for iPhone and iPad users",
      features: [
        "Native iOS app generation",
        "TestFlight beta distribution",
        "App Store submission",
        "Automatic updates",
        "Push notifications support"
      ],
      requirements: [
        "Apple Developer Account ($99/year)",
        "Sign in with Apple ID",
        "App Store guidelines compliance",
        "Review process (1-3 days)"
      ],
      docsUrl: "https://developer.apple.com/app-store/submissions/",
      color: "from-gray-700 to-gray-900",
      textStyle: "bg-gradient-to-br from-gray-200 via-gray-400 to-gray-200 bg-clip-text text-transparent font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]"
    },
    {
      id: "google",
      title: "Publish to Google Play Store",
      description: "Deploy your app to Google Play Store for Android users",
      features: [
        "Native Android app generation",
        "Internal testing tracks",
        "Play Store submission",
        "Automatic updates",
        "Firebase integration"
      ],
      requirements: [
        "Google Play Developer Account ($25 one-time)",
        "Sign in with Google Account",
        "Play Store policies compliance",
        "Review process (1-7 days)"
      ],
      docsUrl: "https://play.google.com/console/about/guides/releasewithconfidence/",
      color: "from-green-500 to-emerald-600",
      textStyle: "bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent font-bold drop-shadow-lg"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />
      
      {/* Hero Section */}
      <section className="pt-32 pb-12 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 text-foreground animate-fade-in">
            Publish Your App
          </h1>
          <p className="text-xl text-muted-foreground animate-fade-in [animation-delay:100ms] max-w-3xl mx-auto">
            Choose your deployment platform and reach your users instantly. Deploy to web, iOS, or Android with just a few clicks.
          </p>
        </div>
      </section>

      {/* Platform Options */}
      <section className="pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {platforms.map((platform, i) => (
              <Card 
                key={platform.id}
                className={`glass-panel border-primary/20 hover:shadow-2xl transition-all duration-300 animate-fade-in cursor-pointer ${
                  selectedPlatform === platform.id ? 'ring-2 ring-accent' : ''
                }`}
                style={{animationDelay: `${i * 100}ms`}}
                onClick={() => setSelectedPlatform(platform.id)}
              >
                <CardHeader>
                  <CardTitle className={`text-3xl text-center mb-2 ${platform.textStyle}`}>
                    {platform.title}
                  </CardTitle>
                  <CardDescription className="text-center">{platform.description}</CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-6">
                  {/* Features */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-accent" />
                      Features
                    </h4>
                    <ul className="space-y-2">
                      {platform.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Requirements */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-accent" />
                      Requirements
                    </h4>
                    <ul className="space-y-2">
                      {platform.requirements.map((req, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                          {req}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Documentation Link */}
                  <a 
                    href={platform.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-accent hover:underline"
                  >
                    <FileText className="w-4 h-4" />
                    View Documentation
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  {/* Publish Button */}
                  <Button
                    onClick={() => handlePublish(platform.title)}
                    className={`w-full bg-gradient-to-r ${platform.color} hover:opacity-90 text-white border-0`}
                    size="lg"
                  >
                    {platform.id === "web" ? "Deploy Now" : `Connect ${platform.id === "apple" ? "Apple" : "Google"} Account`}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Info Banner */}
          <Card className="mt-12 glass-panel border-accent/20 animate-fade-in [animation-delay:400ms]">
            <CardContent className="p-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">Need Help Getting Started?</h3>
                  <p className="text-muted-foreground mb-4">
                    Publishing to app stores requires developer accounts and compliance with platform guidelines. 
                    We'll guide you through the entire process, from account setup to app submission.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" asChild>
                      <a href="https://docs.lovable.dev" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Full Documentation
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto text-center text-muted-foreground">
          <p>&copy; 2025 PlusUltra. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Publish;
