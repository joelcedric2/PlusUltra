import { LandingHeader } from "@/components/landing/LandingHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import logo from "@/assets/plusultra-logo.png";
import {
  Sparkles, 
  Zap, 
  Shield, 
  Code, 
  Rocket, 
  Database, 
  Lock, 
  GitBranch,
  Brain,
  Workflow,
  Users,
  CheckCircle2,
  Clock,
  Bug,
  Smartphone,
  Activity,
  Eye
} from "lucide-react";

const Features = () => {
  const features = [
    {
      icon: <Brain className="w-12 h-12 text-accent" />,
      title: "Multi-AI Orchestration Engine",
      tagline: "Build apps that build themselves",
      whatItIs: "Four autonomous AI agents — Architect, Builder, Debugger, and Publisher — operate as a cohesive digital product team, managing the entire app lifecycle in real time.",
      agents: [
        { name: "Architect", role: "Interprets prompts, models data, defines structures" },
        { name: "Builder", role: "Generates production-ready code (Next.js, SwiftUI, Flutter)" },
        { name: "Debugger", role: "Identifies issues and applies automatic patches" },
        { name: "Publisher", role: "Deploys to App Store, Play Store, or web with compliance" }
      ],
      secretSauce: [
        "AI Consensus Protocol with ≥0.9 cosine similarity validation",
        "Hallucination Shielding via model alignment vault",
        "Hybrid reasoning: symbolic logic + LLM intuition"
      ],
      problemSolved: "Delivers the productivity of a 10-engineer team with single-developer consistency",
      badge: "Core"
    },
    {
      icon: <Clock className="w-12 h-12 text-accent" />,
      title: "TCI — Temporal Code Intelligence",
      tagline: "Your codebase's living memory",
      whatItIs: "A temporal reasoning layer that captures, interprets, and predicts project dynamics, acting as a living memory for your codebase.",
      features: [
        "Vector Database Memory for context-aware retrieval",
        "Temporal Learning Loop refining domain-specific heuristics",
        "Causal Simulation Engine for 'what-if' scenarios",
        "Intent Reconstruction for audit-ready design logs"
      ],
      enables: [
        "Governance & auditability for regulated industries",
        "AI-driven insights acting as virtual CTO",
        "SOC2, GDPR, HIPAA, ISO27001 compliance ready"
      ],
      problemSolved: "Eliminates black-box AI risks with traceable, organization-specific intelligence",
      badge: "Pro & Enterprise"
    },
    {
      icon: <Users className="w-12 h-12 text-accent" />,
      title: "Real-Time Collaboration",
      tagline: "Multiplayer development environment",
      whatItIs: "CRDT-based state streaming merging the best of Figma, Replit, and Lovable for seamless teamwork.",
      features: [
        "Multi-cursor editing with real-time visibility",
        "Inline AI suggestions accepted with one click",
        "AI-assisted comments with refactor proposals",
        "Session replay to review project evolution",
        "Role-based access control (Viewer/Editor/Admin)"
      ],
      problemSolved: "Enables live, conflict-free collaboration without Git merge issues",
      badge: "Core"
    },
    {
      icon: <Bug className="w-12 h-12 text-accent" />,
      title: "Predictive Debugging & Self-Healing",
      tagline: "Fix issues before they break your build",
      whatItIs: "A closed feedback loop that proactively detects, diagnoses, and resolves issues before they disrupt builds.",
      features: [
        "Identifies broken imports, outdated packages, invalid schemas",
        "Clusters related bugs using Error Context Analyzer",
        "Applies self-healing patches with rollback safety",
        "Feeds fixes into TCI for long-term immunity"
      ],
      problemSolved: "Prevents silent build failures with self-correcting system that learns",
      badge: "Core"
    },
    {
      icon: <Smartphone className="w-12 h-12 text-accent" />,
      title: "Cross-Platform Generation",
      tagline: "One codebase, all platforms",
      whatItIs: "Unified workspace for generating and deploying apps across web, iOS, and Android.",
      platforms: [
        { name: "Web", tech: "Next.js / React" },
        { name: "iOS", tech: "SwiftUI" },
        { name: "Android", tech: "Jetpack Compose / Flutter" }
      ],
      automation: [
        "Auto-generates store metadata and screenshots",
        "Manages submission cycles with auto-resubmit",
        "CI/CD pipeline integration",
        "Private enterprise app store support"
      ],
      problemSolved: "Streamlines multi-platform development without separate build tools",
      badge: "Core"
    },
    {
      icon: <Database className="w-12 h-12 text-accent" />,
      title: "Supabase & API Integration",
      tagline: "Full-stack playground",
      whatItIs: "Seamless backend integration sandbox for frictionless full-stack development.",
      features: [
        "One-click Supabase connection (URL + anon key)",
        "Auto-generated CRUD functions",
        "Live API testing and debugging",
        "Request/response inspector with instant replay"
      ],
      problemSolved: "Enables full-stack development without context switching",
      badge: "Core"
    },
    {
      icon: <GitBranch className="w-12 h-12 text-accent" />,
      title: "Project Manager & Rollback Engine",
      tagline: "AI-driven project guidance",
      whatItIs: "Senior-level guidance system that keeps projects stable and efficient.",
      features: [
        "Adaptive suggestions for refactors and optimizations",
        "Guides you on what to keep or remove from your project",
        "Active rollback for failed updates",
        "Performance telemetry monitoring",
        "Failure reasoning in plain language"
      ],
      problemSolved: "Provides senior-level guidance keeping projects stable",
      badge: "Core"
    },
    {
      icon: <Lock className="w-12 h-12 text-accent" />,
      title: "Enterprise Security & Governance",
      tagline: "Compliance-ready infrastructure",
      whatItIs: "Built-in enterprise-grade compliance and observability for regulated industries.",
      features: [
        "Audit-ready logs and version histories",
        "End-to-end encryption of app data",
        "Policy integration for AWS GovCloud",
        "SOC2 and ISO compliance dashboards"
      ],
      problemSolved: "Delivers traceability and control for enterprise adoption",
      badge: "Enterprise"
    },
    {
      icon: <Activity className="w-12 h-12 text-accent" />,
      title: "Adaptive Intelligence Stack",
      tagline: "Under the hood",
      whatItIs: "Scalable, reliable, and explainable AI infrastructure trusted by startups and enterprises.",
      components: [
        "Vectorized Memory Graph for semantic relationships",
        "Model Orchestration Bus for coherent AI communication",
        "Self-Healing Kernel monitoring model confidence",
        "Latency-Optimized Cache Fabric for instant responses"
      ],
      problemSolved: "Provides scalable AI trusted by startups, enterprises, and governments",
      badge: "Core"
    }
  ];

  const comparisons = [
    { challenge: "Multiple tools needed (Figma, Replit, Lovable, Xcode)", solution: "Unified AI-native studio" },
    { challenge: "Random AI outputs / hallucinations", solution: "Model alignment vault & voting consensus" },
    { challenge: "Long dev cycles", solution: "Multi-AI orchestration builds in minutes" },
    { challenge: "Repeated bugs", solution: "Temporal Code Intelligence learns & prevents" },
    { challenge: "Store rejections", solution: "Predictive submission & auto-resubmit" },
    { challenge: "Team silos", solution: "Real-time CRDT collaboration" },
    { challenge: "Compliance burden", solution: "TCI reasoning + audit-ready governance" },
    { challenge: "Lack of explainability", solution: "Full decision trace and rollback audit" }
  ];

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />
      
      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <Badge className="mb-6 bg-accent/10 text-accent border-accent/20 hover:bg-accent/20 animate-fade-in">
            <Sparkles className="w-3 h-3 mr-1" />
            The Self-Debugging App Studio
          </Badge>
          
          <div className="animate-fade-in [animation-delay:100ms]">
            <h1 className="text-4xl md:text-6xl font-bold mb-4 text-foreground flex items-center justify-center gap-4">
              <img src={logo} alt="PlusUltra" className="h-12 md:h-16" />
              PlusUltra
            </h1>
            <p className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-accent to-purple bg-clip-text text-transparent">
              Your coding assistant that gets Smarter<br />
              the more you build
            </p>
          </div>
          
          <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-4xl mx-auto animate-fade-in [animation-delay:200ms]">
            Web and mobile apps designed, debugged, and shipped by AI. From concept to App Store in minutes, not months.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="pb-20 px-6">
        <div className="max-w-7xl mx-auto space-y-12">
          {features.map((feature, i) => (
            <Card 
              key={i} 
              className="glass-panel border-primary/20 hover:shadow-2xl transition-all duration-300 animate-fade-in overflow-hidden"
              style={{animationDelay: `${i * 100}ms`}}
            >
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-accent/10 border border-accent/20">
                      {feature.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-3xl">{feature.title}</CardTitle>
                        <Badge variant="outline" className="bg-accent/5 text-accent border-accent/30">
                          {feature.badge}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground italic">{feature.tagline}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <div>
                  <h4 className="text-lg font-semibold mb-3 text-accent">What It Is</h4>
                  <p className="text-muted-foreground leading-relaxed">{feature.whatItIs}</p>
                </div>

                {feature.agents && (
                  <div>
                    <h4 className="text-lg font-semibold mb-3 text-accent">The Agents</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {feature.agents.map((agent, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                          <CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold">{agent.name}:</span>
                            <span className="text-muted-foreground ml-1">{agent.role}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {feature.secretSauce && (
                  <div>
                    <h4 className="text-lg font-semibold mb-3 text-accent">The Secret Sauce</h4>
                    <ul className="space-y-2">
                      {feature.secretSauce.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <Sparkles className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {feature.features && (
                  <div>
                    <h4 className="text-lg font-semibold mb-3 text-accent">Key Features</h4>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {feature.features.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {feature.enables && (
                  <div>
                    <h4 className="text-lg font-semibold mb-3 text-accent">What It Enables</h4>
                    <ul className="space-y-2">
                      {feature.enables.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <Zap className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {feature.platforms && (
                  <div>
                    <h4 className="text-lg font-semibold mb-3 text-accent">Supported Platforms</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {feature.platforms.map((platform, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-muted/30 text-center">
                          <div className="font-semibold">{platform.name}</div>
                          <div className="text-sm text-muted-foreground">{platform.tech}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {feature.automation && (
                  <div>
                    <h4 className="text-lg font-semibold mb-3 text-accent">Publishing Automation</h4>
                    <ul className="space-y-2">
                      {feature.automation.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <Rocket className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {feature.components && (
                  <div>
                    <h4 className="text-lg font-semibold mb-3 text-accent">Core Components</h4>
                    <ul className="space-y-2">
                      {feature.components.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <Eye className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-4 border-t border-border">
                  <h4 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-accent" />
                    Problem Solved
                  </h4>
                  <p className="text-muted-foreground font-medium">{feature.problemSolved}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Why PlusUltra Is the <span className="bg-gradient-to-r from-accent to-purple bg-clip-text text-transparent">"Saint Grail"</span> of App Creation
            </h2>
            <p className="text-xl text-muted-foreground">Traditional challenges vs. PlusUltra solutions</p>
          </div>
          
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              <div className="bg-destructive/5 p-6">
                <h3 className="text-2xl font-bold mb-6 text-center flex items-center justify-center gap-2">
                  <Code className="w-6 h-6" />
                  Traditional Challenge
                </h3>
              </div>
              <div className="bg-accent/5 p-6">
                <h3 className="text-2xl font-bold mb-6 text-center flex items-center justify-center gap-2">
                  <Zap className="w-6 h-6 text-accent" />
                  PlusUltra Solution
                </h3>
              </div>
            </div>
            
            {comparisons.map((comp, i) => (
              <div 
                key={i}
                className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border hover:bg-muted/20 transition-colors animate-fade-in"
                style={{animationDelay: `${i * 50}ms`}}
              >
                <div className="p-6 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-destructive shrink-0" />
                  <p className="text-muted-foreground">{comp.challenge}</p>
                </div>
                <div className="p-6 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />
                  <p className="font-medium">{comp.solution}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center glass-panel rounded-3xl p-12 animate-scale-in">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Ready to Experience It?</h2>
          <p className="text-xl text-muted-foreground mb-8">
            Start building with all these features today, completely free
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-accent to-purple text-white border-0 text-lg px-8 py-6 hover:scale-110 hover:shadow-2xl hover:shadow-accent/50 transition-all duration-300"
              asChild
            >
              <Link to="/workspace">
                <Rocket className="w-5 h-5 mr-2" />
                Start Building Now
              </Link>
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="text-lg px-8 py-6 hover:scale-105 transition-all duration-300"
              asChild
            >
              <Link to="/pricing">
                View Pricing
              </Link>
            </Button>
          </div>
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

export default Features;
