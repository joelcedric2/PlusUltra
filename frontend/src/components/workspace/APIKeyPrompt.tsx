/**
 * APIKeyPrompt - In-chat API key entry component
 *
 * Appears in the chat area when API keys are needed.
 * Features:
 * - Clean, non-intrusive design that fits chat flow
 * - Provider icons for visual recognition
 * - Secure input (password field)
 * - Smooth exit animation when key is submitted
 * - Never shows the key after submission
 * - Validates key format before submission
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { springs, fadeInUp } from '@/lib/animations';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Key,
  Check,
  X,
  Loader2,
  AlertCircle,
  Sparkles,
  Brain,
  Zap,
  Eye,
  Moon
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export type LLMProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'xai'
  | 'moonshot'
  | 'deepseek';

interface APIKeyPromptProps {
  /** Provider requiring the key */
  provider: LLMProvider;
  /** Called when key is submitted successfully */
  onSubmit: (provider: LLMProvider, key: string) => Promise<void>;
  /** Called when user dismisses the prompt */
  onDismiss?: () => void;
  /** Whether this is a required key (cannot dismiss) */
  required?: boolean;
  /** Custom message to show */
  message?: string;
}

// =============================================================================
// PROVIDER CONFIGURATION
// =============================================================================

interface ProviderConfig {
  name: string;
  icon: React.ReactNode;
  placeholder: string;
  hint: string;
  keyPrefix?: string;
  color: string;
  docsUrl: string;
}

const providerConfigs: Record<LLMProvider, ProviderConfig> = {
  anthropic: {
    name: 'Claude (Anthropic)',
    icon: <Sparkles className="w-5 h-5" />,
    placeholder: 'sk-ant-api...',
    hint: 'Starts with sk-ant-api',
    keyPrefix: 'sk-ant',
    color: 'text-orange-500',
    docsUrl: 'https://console.anthropic.com/account/keys',
  },
  openai: {
    name: 'OpenAI',
    icon: <Brain className="w-5 h-5" />,
    placeholder: 'sk-...',
    hint: 'Starts with sk-',
    keyPrefix: 'sk-',
    color: 'text-green-500',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  google: {
    name: 'Google Gemini',
    icon: <Zap className="w-5 h-5" />,
    placeholder: 'AIza...',
    hint: 'Starts with AIza',
    keyPrefix: 'AIza',
    color: 'text-blue-500',
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  xai: {
    name: 'xAI (Grok)',
    icon: <Eye className="w-5 h-5" />,
    placeholder: 'xai-...',
    hint: 'Starts with xai-',
    keyPrefix: 'xai-',
    color: 'text-gray-400',
    docsUrl: 'https://x.ai/api',
  },
  moonshot: {
    name: 'Kimi (Moonshot)',
    icon: <Moon className="w-5 h-5" />,
    placeholder: 'sk-...',
    hint: 'Your Moonshot API key',
    color: 'text-purple-500',
    docsUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  deepseek: {
    name: 'DeepSeek',
    icon: <Brain className="w-5 h-5" />,
    placeholder: 'sk-...',
    hint: 'Your DeepSeek API key',
    keyPrefix: 'sk-',
    color: 'text-cyan-500',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
};

// =============================================================================
// API KEY PROMPT COMPONENT
// =============================================================================

export function APIKeyPrompt({
  provider,
  onSubmit,
  onDismiss,
  required = false,
  message,
}: APIKeyPromptProps) {
  const { toast } = useToast();
  const [key, setKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  const config = providerConfigs[provider];

  // Validate key format
  const validateKey = useCallback((value: string): boolean => {
    if (!value.trim()) {
      setError('API key is required');
      return false;
    }

    if (value.length < 20) {
      setError('API key seems too short');
      return false;
    }

    if (config.keyPrefix && !value.startsWith(config.keyPrefix)) {
      setError(`Key should start with ${config.keyPrefix}`);
      return false;
    }

    setError(null);
    return true;
  }, [config.keyPrefix]);

  // Handle submission
  const handleSubmit = async () => {
    if (!validateKey(key)) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(provider, key);

      // Show success and animate out
      toast({
        title: 'API key saved',
        description: `${config.name} key has been securely stored.`,
      });

      // Clear and hide
      setKey('');
      setIsVisible(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key');
      toast({
        title: 'Failed to save key',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle dismiss
  const handleDismiss = () => {
    if (!required) {
      setIsVisible(false);
      onDismiss?.();
    }
  };

  // Handle key input
  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setKey(value);
    if (error) {
      validateKey(value);
    }
  };

  // Handle enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && !required) {
      handleDismiss();
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={cn(
            'mx-4 my-3 p-4 rounded-xl',
            'glass-panel',
            'border-l-4',
            error ? 'border-l-destructive' : 'border-l-accent'
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-10 h-10 rounded-lg',
                  'flex items-center justify-center',
                  'bg-muted/50',
                  config.color
                )}
              >
                {config.icon}
              </div>
              <div>
                <h4 className="font-semibold text-foreground">
                  Connect {config.name}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {message || 'Enter your API key to enable this model'}
                </p>
              </div>
            </div>

            {/* Dismiss button */}
            {!required && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Input area */}
          <div className="space-y-2">
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="password"
                value={key}
                onChange={handleKeyChange}
                onKeyDown={handleKeyDown}
                placeholder={config.placeholder}
                disabled={isSubmitting}
                className={cn(
                  'pl-10 pr-24',
                  'glass-input',
                  error && 'border-destructive focus:border-destructive'
                )}
                autoComplete="off"
                autoFocus
              />
              <Button
                onClick={handleSubmit}
                disabled={!key.trim() || isSubmitting}
                size="sm"
                className={cn(
                  'absolute right-1.5 top-1/2 -translate-y-1/2',
                  'h-7 px-3',
                  'bg-gradient-to-r from-accent to-purple',
                  'hover:opacity-90',
                  'disabled:opacity-50'
                )}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Save
                  </>
                )}
              </Button>
            </div>

            {/* Error message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <AlertCircle className="w-4 h-4" />
                {error}
              </motion.div>
            )}

            {/* Hint and docs link */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{config.hint}</span>
              <a
                href={config.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Get API key →
              </a>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// API KEY REQUIREMENTS BANNER
// =============================================================================

interface APIKeyRequirementsBannerProps {
  /** Missing providers */
  missingProviders: LLMProvider[];
  /** Current connected providers */
  connectedProviders: LLMProvider[];
  /** Handler to add a provider key */
  onAddKey: (provider: LLMProvider) => void;
}

export function APIKeyRequirementsBanner({
  missingProviders,
  connectedProviders,
  onAddKey,
}: APIKeyRequirementsBannerProps) {
  const minRequired = 2;
  const hasMinimum = connectedProviders.length >= minRequired;

  if (hasMinimum && missingProviders.length === 0) {
    return null;
  }

  // Recommended providers if missing
  const recommended: LLMProvider[] = ['anthropic', 'moonshot'];
  const missingRecommended = recommended.filter((p) =>
    missingProviders.includes(p)
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'mx-4 my-3 p-4 rounded-xl',
        'glass-panel',
        !hasMinimum ? 'border-l-4 border-l-orange-500' : 'border-l-4 border-l-accent'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            'bg-orange-500/10 text-orange-500'
          )}
        >
          <Key className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-foreground mb-1">
            {hasMinimum ? 'Add More AI Models' : 'Connect AI Models'}
          </h4>
          <p className="text-sm text-muted-foreground mb-3">
            {hasMinimum
              ? 'Connect additional models to unlock more capabilities.'
              : `PlusUltra requires at least ${minRequired} AI models. We recommend Claude and Kimi.`}
          </p>

          {/* Quick add buttons for recommended */}
          <div className="flex flex-wrap gap-2">
            {missingRecommended.map((provider) => {
              const config = providerConfigs[provider];
              return (
                <Button
                  key={provider}
                  variant="outline"
                  size="sm"
                  onClick={() => onAddKey(provider)}
                  className={cn(
                    'gap-2',
                    'hover:border-accent/50 hover:bg-accent/5'
                  )}
                >
                  <span className={config.color}>{config.icon}</span>
                  Add {config.name.split(' ')[0]}
                </Button>
              );
            })}
          </div>

          {/* Connected providers */}
          {connectedProviders.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Connected:</span>
              {connectedProviders.map((provider) => {
                const config = providerConfigs[provider];
                return (
                  <span
                    key={provider}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
                      'bg-success/10 text-success'
                    )}
                  >
                    <Check className="w-3 h-3" />
                    {config.name.split(' ')[0]}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default APIKeyPrompt;
