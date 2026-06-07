/**
 * PlusUltra Landing Page - Ultra Premium Tech Aesthetic
 *
 * A scroll-driven narrative experience showcasing PlusUltra's capabilities.
 * Features advanced Framer Motion animations with luxury tech aesthetic.
 *
 * Sections:
 * 1. Hero with Three.js globe and premium prompt input
 * 2. TCI (Temporal Code Intelligence) showcase
 * 3. Features with staggered reveals
 * 4. AI Council visualization
 * 5. Community templates
 * 6. Final CTA
 */

import { useState, useRef, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { AnimatedGlobe } from '@/components/landing/AnimatedGlobe';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Check,
  Sparkles,
  Zap,
  Shield,
  Code,
  Rocket,
  Users,
  MoreVertical,
  Eye,
  Trash2,
  ArrowRight,
  Brain,
  Layers,
  Globe,
  Clock,
  GitBranch,
  History,
  RefreshCw,
  Database,
  Lock,
  Send,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  staggerContainer,
  staggerItem,
  fadeInUp,
  fadeInLeft,
  fadeInRight,
  scaleIn,
  scrollReveal,
  springs,
  scrollViewport,
} from '@/lib/animations';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// =============================================================================
// TYPES & DATA
// =============================================================================

interface TemplateDetails {
  title: string;
  description: string;
  author: string;
  techStack: string[];
  features: string[];
}

const templateData: Record<string, TemplateDetails> = {
  'SaaS Starter': {
    title: 'SaaS Starter',
    description:
      'Complete SaaS boilerplate with authentication, subscription management, user dashboard, and payment processing.',
    author: 'PlusUltra',
    techStack: ['Next.js 14', 'TypeScript', 'Stripe', 'Supabase', 'Tailwind CSS', 'shadcn/ui'],
    features: [
      'User Authentication',
      'Subscription Plans',
      'Payment Integration',
      'Admin Dashboard',
      'Email Notifications',
      'API Rate Limiting',
    ],
  },
  'E-commerce Store': {
    title: 'E-commerce Store',
    description:
      'Full-featured online store with product catalog, shopping cart, checkout flow, and inventory management.',
    author: 'Community',
    techStack: ['React', 'Node.js', 'MongoDB', 'Stripe', 'Redux', 'Material-UI'],
    features: [
      'Product Catalog',
      'Shopping Cart',
      'Secure Checkout',
      'Order Management',
      'Inventory Tracking',
      'Customer Accounts',
    ],
  },
  'Dashboard Pro': {
    title: 'Dashboard Pro',
    description:
      'Professional analytics dashboard with charts, data visualization, and customizable widgets.',
    author: 'Community',
    techStack: ['React', 'Chart.js', 'D3.js', 'TypeScript', 'Tailwind CSS', 'WebSockets'],
    features: [
      'Real-time Analytics',
      'Custom Charts',
      'Data Export',
      'Responsive Design',
      'Role-based Access',
      'Dark Mode',
    ],
  },
  'Landing Page Kit': {
    title: 'Landing Page Kit',
    description:
      'Collection of beautiful, conversion-optimized landing page components for product launches.',
    author: 'PlusUltra',
    techStack: ['Next.js', 'TypeScript', 'Framer Motion', 'Tailwind CSS', 'React Hook Form'],
    features: [
      'Hero Sections',
      'Feature Showcases',
      'Testimonials',
      'Pricing Tables',
      'Contact Forms',
      'SEO Optimized',
    ],
  },
  'Blog Platform': {
    title: 'Blog Platform',
    description:
      'Modern blogging platform with CMS, markdown support, and content management.',
    author: 'Community',
    techStack: ['Next.js', 'MDX', 'Contentful', 'TypeScript', 'Tailwind CSS', 'Vercel'],
    features: [
      'Markdown Editor',
      'Content Management',
      'SEO Tools',
      'Social Sharing',
      'Comments System',
      'RSS Feed',
    ],
  },
  'AI Chatbot': {
    title: 'AI Chatbot',
    description:
      'Intelligent conversational AI interface with memory and context awareness.',
    author: 'PlusUltra',
    techStack: ['React', 'OpenAI API', 'LangChain', 'Vector DB', 'TypeScript', 'Tailwind CSS'],
    features: [
      'Context Awareness',
      'Memory Management',
      'Custom Training',
      'Multi-turn Conversations',
      'API Integration',
      'Response Streaming',
    ],
  },
};

const features = [
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Build and deploy apps in minutes, not months. AI handles the complexity.',
    color: 'text-accent',
    bgColor: 'bg-accent/10',
  },
  {
    icon: Shield,
    title: 'Self-Healing',
    description: 'AI automatically debugs and fixes issues, ensuring your app stays running.',
    color: 'text-purple',
    bgColor: 'bg-purple/10',
  },
  {
    icon: Code,
    title: 'Full Control',
    description: 'Export to GitHub anytime. Own your code, no vendor lock-in.',
    color: 'text-accent',
    bgColor: 'bg-accent/10',
  },
  {
    icon: Brain,
    title: 'AI Council',
    description: 'Multiple AI models collaborate and validate each other for better results.',
    color: 'text-purple',
    bgColor: 'bg-purple/10',
  },
  {
    icon: Globe,
    title: 'Web & Mobile',
    description: 'Deploy to web or convert to native mobile apps with one click.',
    color: 'text-accent',
    bgColor: 'bg-accent/10',
  },
  {
    icon: Layers,
    title: 'Full Stack',
    description: 'Frontend, backend, database, and deployment—all handled automatically.',
    color: 'text-purple',
    bgColor: 'bg-purple/10',
  },
];

// TCI 6-Layer Architecture Data
const tciLayers = [
  {
    icon: Clock,
    title: 'Temporal Analysis',
    description: 'Understands how your code evolves over time, learning from every change.',
    color: 'from-[#17d9e3] to-[#0ea5e9]',
  },
  {
    icon: GitBranch,
    title: 'Version Intelligence',
    description: 'Tracks branches, merges, and conflicts to suggest optimal code paths.',
    color: 'from-[#0ea5e9] to-[#a855f7]',
  },
  {
    icon: History,
    title: 'Pattern Memory',
    description: 'Remembers coding patterns and applies best practices automatically.',
    color: 'from-[#a855f7] to-[#c084fc]',
  },
  {
    icon: RefreshCw,
    title: 'Self-Correction',
    description: 'Detects errors in real-time and fixes them before they reach production.',
    color: 'from-[#c084fc] to-[#17d9e3]',
  },
  {
    icon: Database,
    title: 'Context Retention',
    description: 'Maintains deep understanding of your entire codebase architecture.',
    color: 'from-[#17d9e3] to-[#a855f7]',
  },
  {
    icon: Lock,
    title: 'Security Shield',
    description: 'Continuously scans for vulnerabilities and applies security patches.',
    color: 'from-[#a855f7] to-[#17d9e3]',
  },
];

// =============================================================================
// LANDING PAGE COMPONENT
// =============================================================================

const Landing = () => {
  const [prompt, setPrompt] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDetails | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  // Scroll-based parallax for hero
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 600], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 600], [1, 0.9]);
  const heroY = useTransform(scrollY, [0, 600], [0, 150]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleBuildApp = () => {
    if (prompt.trim()) {
      navigate('/workspace', {
        state: {
          prompt: prompt.trim(),
        },
      });
    }
  };

  const handleCloneTemplate = (template: string, description: string) => {
    if (!isAuthenticated) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to clone templates',
      });
      navigate('/signin');
      return;
    }

    navigate('/workspace', {
      state: {
        template,
        prompt: `Clone and customize: ${description}`,
      },
    });
  };

  const handleViewDetails = (templateTitle: string) => {
    const template = templateData[templateTitle];
    if (template) {
      setSelectedTemplate(template);
      setIsDetailsModalOpen(true);
    }
  };

  const handleRemoveTemplate = (templateTitle: string) => {
    toast({
      title: 'Template removed',
      description: `"${templateTitle}" has been removed from your list`,
    });
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <LandingHeader />

      {/* ===================================================================
          HERO SECTION - Three.js Globe Background + Premium Prompt
          =================================================================== */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden"
      >
        {/* Three.js Globe Background - Fixed position to prevent scroll jank */}
        <div className="fixed inset-0 z-0" style={{ willChange: 'auto' }}>
          <Suspense fallback={null}>
            <AnimatedGlobe />
          </Suspense>
        </div>

        {/* Gradient overlays for depth */}
        <div className="fixed inset-0 z-[1] pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background/50 to-background" />
          <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-background to-transparent" />
        </div>

        {/* Hero Content */}
        <motion.div
          style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
          className="max-w-5xl mx-auto text-center relative z-10 pt-20"
        >
          {/* Badge */}
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.1 }}
          >
            <Badge
              className={cn(
                'mb-10 px-5 py-2',
                'bg-accent/10 text-accent border-accent/30',
                'backdrop-blur-md',
                'hover:bg-accent/20 transition-all duration-300',
                'text-sm font-medium tracking-wide'
              )}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Powered by TCI — Temporal Code Intelligence
            </Badge>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.2 }}
            className="text-5xl md:text-7xl lg:text-8xl font-bold mb-6 text-foreground tracking-tight leading-[1.05]"
          >
            Build apps that
          </motion.h1>
          <motion.h1
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.25 }}
            className="text-5xl md:text-7xl lg:text-8xl font-bold mb-10 tracking-tight leading-[1.05]"
          >
            <span className="gradient-text">evolve with you</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.3 }}
            className="text-xl md:text-2xl text-muted-foreground mb-16 max-w-2xl mx-auto leading-relaxed"
          >
            Web and mobile apps, designed, debugged, and shipped by AI that learns your codebase
          </motion.p>

          {/* Premium Single-Row Prompt Input - Apple Glassmorphic Style */}
          <motion.div
            variants={scaleIn}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.4 }}
            className="max-w-2xl mx-auto"
          >
            <div
              className={cn(
                'relative flex items-center',
                'rounded-[28px]',
                'p-1.5 pl-7',
                'transition-all duration-500 ease-out'
              )}
              style={{
                background: 'linear-gradient(135deg, rgba(23, 217, 227, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
                backdropFilter: 'blur(40px) saturate(180%)',
                WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: `
                  0 0 0 1px rgba(255, 255, 255, 0.05) inset,
                  0 2px 20px -4px rgba(0, 0, 0, 0.3),
                  0 8px 40px -8px rgba(23, 217, 227, 0.15),
                  0 16px 60px -12px rgba(168, 85, 247, 0.1)
                `,
              }}
            >
              {/* Inner glass layer for depth */}
              <div
                className="absolute inset-[1px] rounded-[27px] pointer-events-none"
                style={{
                  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)',
                }}
              />

              {/* Input */}
              <Input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your app idea..."
                className={cn(
                  'relative flex-1 bg-transparent border-0',
                  'focus-visible:ring-0 focus-visible:ring-offset-0',
                  'placeholder:text-muted-foreground/40',
                  'text-lg h-14',
                  'pr-4'
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleBuildApp();
                  }
                }}
              />

              {/* Send Button */}
              <Button
                onClick={handleBuildApp}
                disabled={!prompt.trim()}
                className={cn(
                  'relative h-14 px-7 rounded-[22px]',
                  'bg-gradient-to-r from-accent via-accent to-purple',
                  'hover:brightness-110 disabled:opacity-30',
                  'text-white font-semibold',
                  'transition-all duration-300',
                  'flex items-center gap-2'
                )}
                style={{
                  boxShadow: '0 4px 20px -4px rgba(23, 217, 227, 0.4), 0 8px 32px -8px rgba(168, 85, 247, 0.3)',
                }}
              >
                <span className="hidden sm:inline">Start Building</span>
                <Send className="w-4 h-4" />
              </Button>
            </div>

            {/* Keyboard hint */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-6 text-sm text-muted-foreground/50"
            >
              Press{' '}
              <kbd className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-muted-foreground/70">
                Enter
              </kbd>{' '}
              to start • Your idea, our AI Council
            </motion.p>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center p-2"
          >
            <motion.div className="w-1.5 h-1.5 rounded-full bg-accent" />
          </motion.div>
        </motion.div>
      </section>

      {/* ===================================================================
          TCI SECTION - Temporal Code Intelligence
          =================================================================== */}
      <section className="py-32 px-6 relative overflow-hidden bg-background z-10">
        {/* Background effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/4 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[150px]" />
          <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-purple/5 rounded-full blur-[120px]" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          {/* Section Header */}
          <motion.div
            variants={scrollReveal}
            initial="hidden"
            whileInView="visible"
            viewport={scrollViewport}
            className="text-center mb-20"
          >
            <Badge
              className={cn(
                'mb-8 px-4 py-1.5',
                'bg-gradient-to-r from-accent/10 to-purple/10',
                'text-accent border-accent/20'
              )}
            >
              <Layers className="w-3.5 h-3.5 mr-1.5" />
              Temporal Code Intelligence
            </Badge>
            <h2 className="text-4xl md:text-6xl font-bold mb-4 leading-[1.1]">
              6 Layers of
            </h2>
            <h2 className="text-4xl md:text-6xl font-bold mb-8 leading-[1.1]">
              <span className="gradient-text">Intelligent Understanding</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              TCI is our revolutionary AI system that deeply understands your code through time,
              enabling self-debugging, pattern learning, and continuous evolution.
            </p>
          </motion.div>

          {/* TCI Layers Grid */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={scrollViewport}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {tciLayers.map((layer, index) => (
              <motion.div
                key={layer.title}
                variants={staggerItem}
                whileHover={{ y: -8, transition: springs.snappy }}
                className="group"
              >
                <div
                  className={cn(
                    'relative h-full p-8 rounded-2xl',
                    'bg-card/60 backdrop-blur-xl',
                    'border border-white/[0.08]',
                    'hover:border-accent/30',
                    'transition-all duration-500',
                    'overflow-hidden'
                  )}
                  style={{
                    boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.15)',
                  }}
                >
                  {/* Gradient bar at top */}
                  <div
                    className={cn(
                      'absolute top-0 left-0 right-0 h-1',
                      `bg-gradient-to-r ${layer.color}`,
                      'opacity-60 group-hover:opacity-100',
                      'transition-opacity duration-300'
                    )}
                  />

                  {/* Icon */}
                  <div
                    className={cn(
                      'w-14 h-14 rounded-xl mb-6',
                      'flex items-center justify-center',
                      `bg-gradient-to-br ${layer.color}`,
                      'shadow-lg',
                      'group-hover:scale-110 group-hover:rotate-3',
                      'transition-transform duration-300'
                    )}
                  >
                    <layer.icon className="w-7 h-7 text-white" />
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-bold mb-3 text-foreground">
                    {layer.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {layer.description}
                  </p>

                  {/* Layer number */}
                  <div
                    className={cn(
                      'absolute bottom-4 right-4',
                      'text-6xl font-bold',
                      'text-muted/10 group-hover:text-accent/10',
                      'transition-colors duration-300'
                    )}
                  >
                    {index + 1}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* TCI CTA */}
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={scrollViewport}
            className="mt-16 text-center"
          >
            <p className="text-lg text-muted-foreground mb-6">
              TCI learns from every project, becoming smarter with each line of code.
            </p>
            <Button
              variant="outline"
              size="lg"
              className="group border-accent/30 hover:bg-accent/10 hover:border-accent/50"
              onClick={() => navigate('/workspace')}
            >
              Experience TCI in Action
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ===================================================================
          FEATURES SECTION - Staggered reveal on scroll
          =================================================================== */}
      <section className="py-28 px-6 relative bg-background z-10">
        <div className="max-w-7xl mx-auto">
          <motion.div
            variants={scrollReveal}
            initial="hidden"
            whileInView="visible"
            viewport={scrollViewport}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-bold mb-6 leading-[1.15]">
              Why choose PlusUltra?
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Everything you need to build and ship apps, powered by AI
            </p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={scrollViewport}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {features.map((feature) => (
              <motion.div
                key={feature.title}
                variants={staggerItem}
                whileHover={{ y: -4, transition: springs.snappy }}
                className="group"
              >
                <Card
                  className={cn(
                    'h-full',
                    'bg-card/60 backdrop-blur-xl',
                    'border border-white/[0.08] hover:border-accent/30',
                    'transition-all duration-300'
                  )}
                  style={{
                    boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.15)',
                  }}
                >
                  <CardHeader>
                    <div
                      className={cn(
                        'w-12 h-12 rounded-xl mb-4',
                        'flex items-center justify-center',
                        feature.bgColor,
                        'group-hover:scale-110 transition-transform duration-300'
                      )}
                    >
                      <feature.icon className={cn('w-6 h-6', feature.color)} />
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===================================================================
          AI COUNCIL SECTION
          =================================================================== */}
      <section className="py-28 px-6 relative overflow-hidden bg-background z-10">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/20 to-transparent" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: Text content */}
            <motion.div
              variants={fadeInLeft}
              initial="hidden"
              whileInView="visible"
              viewport={scrollViewport}
            >
              <Badge className="mb-8 bg-purple/10 text-purple border-purple/20">
                <Brain className="w-3.5 h-3.5 mr-1.5" />
                AI Council Technology
              </Badge>
              <h2 className="text-3xl md:text-5xl font-bold mb-4 leading-[1.15]">
                Multiple AI minds,
              </h2>
              <h2 className="text-3xl md:text-5xl font-bold mb-10 leading-[1.15]">
                <span className="gradient-text">one unified vision</span>
              </h2>
              <p className="text-lg text-muted-foreground mb-12 leading-relaxed">
                Unlike single-model tools, PlusUltra uses a council of specialized AI models that
                collaborate and validate each other. This multi-model approach catches errors,
                suggests better solutions, and delivers production-ready code.
              </p>
              <ul className="space-y-5">
                {[
                  'Claude for reasoning and architecture',
                  'Kimi for visual and animation understanding',
                  'Gemini for cross-validation and synthesis',
                  'GPT for code generation and debugging',
                ].map((item, i) => (
                  <motion.li
                    key={item}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-4"
                  >
                    <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 text-accent" />
                    </div>
                    <span className="text-foreground text-lg">{item}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>

            {/* Right: Visual */}
            <motion.div
              variants={fadeInRight}
              initial="hidden"
              whileInView="visible"
              viewport={scrollViewport}
              className="relative"
            >
              <div className="aspect-square max-w-lg mx-auto relative">
                {/* Central orb */}
                <motion.div
                  animate={{
                    boxShadow: [
                      '0 0 60px rgba(23, 217, 227, 0.3)',
                      '0 0 80px rgba(23, 217, 227, 0.4)',
                      '0 0 60px rgba(23, 217, 227, 0.3)',
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className={cn(
                    'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
                    'w-36 h-36 rounded-full',
                    'bg-gradient-to-br from-accent to-purple',
                    'flex items-center justify-center'
                  )}
                >
                  <Sparkles className="w-14 h-14 text-white" />
                </motion.div>

                {/* Orbiting elements */}
                {[
                  { icon: Brain, color: 'bg-gradient-to-br from-[#17d9e3] to-[#0ea5e9]', position: 'top-4 left-1/2 -translate-x-1/2' },
                  { icon: Eye, color: 'bg-gradient-to-br from-[#a855f7] to-[#c084fc]', position: 'top-1/2 right-4 -translate-y-1/2' },
                  { icon: Zap, color: 'bg-gradient-to-br from-[#0ea5e9] to-[#17d9e3]', position: 'bottom-4 left-1/2 -translate-x-1/2' },
                  { icon: Code, color: 'bg-gradient-to-br from-[#c084fc] to-[#a855f7]', position: 'top-1/2 left-4 -translate-y-1/2' },
                ].map(({ icon: Icon, color, position }, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.1, ...springs.bouncy }}
                    className={cn(
                      'absolute',
                      position,
                      'w-18 h-18 w-[72px] h-[72px] rounded-2xl',
                      color,
                      'flex items-center justify-center',
                      'shadow-xl'
                    )}
                  >
                    <Icon className="w-9 h-9 text-white" />
                  </motion.div>
                ))}

                {/* Connecting lines */}
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox="0 0 400 400"
                  fill="none"
                >
                  {[45, 135, 225, 315].map((angle, i) => (
                    <motion.line
                      key={i}
                      x1="200"
                      y1="200"
                      x2={200 + Math.cos((angle * Math.PI) / 180) * 130}
                      y2={200 + Math.sin((angle * Math.PI) / 180) * 130}
                      stroke="url(#gradient)"
                      strokeWidth="2"
                      strokeDasharray="8 4"
                      initial={{ pathLength: 0, opacity: 0 }}
                      whileInView={{ pathLength: 1, opacity: 0.5 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                    />
                  ))}
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="hsl(189 94% 43%)" />
                      <stop offset="100%" stopColor="hsl(271 76% 53%)" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          TEMPLATES SECTION
          =================================================================== */}
      <section className="py-28 px-6 bg-background z-10 relative">
        <div className="max-w-7xl mx-auto">
          <motion.div
            variants={scrollReveal}
            initial="hidden"
            whileInView="visible"
            viewport={scrollViewport}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-bold mb-6 leading-[1.15]">
              Start with a template
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Clone and customize projects from the community
            </p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={scrollViewport}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {Object.entries(templateData).map(([key, template]) => (
              <motion.div
                key={key}
                variants={staggerItem}
                whileHover={{ y: -4, transition: springs.snappy }}
              >
                <Card
                  className={cn(
                    'h-full cursor-pointer group',
                    'bg-card/60 backdrop-blur-xl',
                    'border border-white/[0.08]',
                    'hover:border-accent/30 hover:bg-card/80',
                    'transition-all duration-300'
                  )}
                  style={{
                    boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.2)',
                  }}
                  onClick={() => handleCloneTemplate(key, template.description)}
                >
                  <CardHeader className="relative">
                    <div
                      className={cn(
                        'aspect-video rounded-xl mb-4 overflow-hidden',
                        'bg-gradient-to-br from-accent/8 via-purple/5 to-accent/8',
                        'flex items-center justify-center',
                        'border border-white/[0.05]',
                        'group-hover:from-accent/15 group-hover:via-purple/10 group-hover:to-accent/15',
                        'transition-all duration-500'
                      )}
                    >
                      <Users className="w-12 h-12 text-muted-foreground/30 group-hover:text-accent/70 group-hover:scale-110 transition-all duration-300" />
                    </div>

                    {/* 3-Dot Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted/50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 glass-elevated">
                        <DropdownMenuItem
                          className="cursor-pointer gap-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloneTemplate(key, template.description);
                          }}
                        >
                          <Code className="w-4 h-4" />
                          Clone Template
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer gap-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetails(key);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveTemplate(key);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                          Remove from List
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <CardTitle>{template.title}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {template.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        by {template.author}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="group-hover:bg-accent/10 group-hover:text-accent transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloneTemplate(key, template.description);
                        }}
                      >
                        Clone
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===================================================================
          FINAL CTA
          =================================================================== */}
      <section className="py-28 px-6 bg-background z-10 relative">
        <motion.div
          variants={scrollReveal}
          initial="hidden"
          whileInView="visible"
          viewport={scrollViewport}
          className="max-w-4xl mx-auto"
        >
          <div
            className="rounded-3xl p-16 text-center relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(23, 217, 227, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)',
              backdropFilter: 'blur(40px) saturate(150%)',
              WebkitBackdropFilter: 'blur(40px) saturate(150%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 8px 40px -8px rgba(0, 0, 0, 0.3), 0 0 80px -20px rgba(23, 217, 227, 0.15)',
            }}
          >
            {/* Background glow */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[60%] bg-gradient-to-b from-accent/10 via-purple/5 to-transparent blur-3xl" />
            </div>

            <div className="relative z-10">
              <h2 className="text-3xl md:text-5xl font-bold mb-6 leading-[1.15]">
                Ready to build something amazing?
              </h2>
              <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
                Join thousands of developers shipping apps faster with TCI-powered AI
              </p>
              <Button
                size="lg"
                className={cn(
                  'text-lg px-10 py-7 h-auto rounded-2xl',
                  'bg-gradient-to-r from-accent via-accent to-purple',
                  'hover:brightness-110',
                  'hover:scale-[1.02]',
                  'transition-all duration-300',
                  'text-white font-semibold'
                )}
                style={{
                  boxShadow: '0 8px 32px -8px rgba(23, 217, 227, 0.4), 0 16px 48px -12px rgba(168, 85, 247, 0.25)',
                }}
                onClick={() => navigate('/workspace')}
              >
                <Rocket className="w-5 h-5 mr-3" />
                Start Building for Free
              </Button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ===================================================================
          FOOTER
          =================================================================== */}
      <footer className="py-16 px-6 border-t border-border/50 bg-background z-10 relative">
        <div className="max-w-7xl mx-auto text-center text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} PlusUltra. All rights reserved.</p>
        </div>
      </footer>

      {/* ===================================================================
          TEMPLATE DETAILS MODAL
          =================================================================== */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto glass-elevated">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{selectedTemplate?.title}</DialogTitle>
            <DialogDescription className="text-base">by {selectedTemplate?.author}</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Preview Placeholder */}
            <div className="aspect-video bg-gradient-to-br from-accent/10 to-purple/10 rounded-lg flex items-center justify-center">
              <Users className="w-16 h-16 text-muted-foreground/40" />
            </div>

            {/* Description */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Description</h3>
              <p className="text-muted-foreground">{selectedTemplate?.description}</p>
            </div>

            {/* Tech Stack */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Tech Stack</h3>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate?.techStack.map((tech, index) => (
                  <Badge key={index} variant="secondary" className="bg-accent/10 text-accent border-accent/20">
                    {tech}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Features */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Features Included</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {selectedTemplate?.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-accent" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button
                className="flex-1 bg-gradient-to-r from-accent to-purple hover:opacity-90 text-white border-0"
                onClick={() => {
                  if (selectedTemplate) {
                    handleCloneTemplate(selectedTemplate.title, selectedTemplate.description);
                    setIsDetailsModalOpen(false);
                  }
                }}
              >
                <Code className="w-4 h-4 mr-2" />
                Clone This Template
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsDetailsModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Landing;
