import { TokenManagementService, TokenUsage, TokenPool, AIRequest } from '../../src/services/token/TokenManagementService';
import { BillingService } from '../../src/services/billing/BillingService';

// Mock dependencies
jest.mock('../../src/services/vector/PostgresVectorStore');
jest.mock('../../src/services/billing/BillingService');

describe('TokenManagementService', () => {
  let tokenService: TokenManagementService;
  let mockVectorStore: jest.Mocked<any>;
  let mockBillingService: jest.Mocked<BillingService>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create service instance
    tokenService = new TokenManagementService();

    // Get mock instances
    mockVectorStore = (tokenService as any).vectorStore;
    mockBillingService = (tokenService as any).billingService;

    // Setup default mock implementations
    mockVectorStore.similaritySearch.mockResolvedValue([]);
    mockVectorStore.addDocuments.mockResolvedValue(undefined);
    mockBillingService.canPerformAction.mockResolvedValue({ canProceed: true });
  });

  describe('Token Cost Calculation', () => {
    test('should calculate correct token cost for single AI request', () => {
      const request: AIRequest = {
        model: 'Claude',
        complexity: 'medium'
      };

      const cost = tokenService.calculateRequestCost(request);
      expect(cost).toBe(20); // Base cost for Claude medium complexity
    });

    test('should use provided token count when specified', () => {
      const request: AIRequest = {
        model: 'GPT5',
        complexity: 'high',
        tokens: 150
      };

      const cost = tokenService.calculateRequestCost(request);
      expect(cost).toBe(150); // Should use provided token count
    });

    test('should handle all complexity levels correctly', () => {
      const testCases = [
        { model: 'GPT5' as const, complexity: 'low' as const, expected: 8 },
        { model: 'GPT5' as const, complexity: 'medium' as const, expected: 35 },
        { model: 'GPT5' as const, complexity: 'high' as const, expected: 70 },
        { model: 'Claude' as const, complexity: 'low' as const, expected: 5 },
        { model: 'Claude' as const, complexity: 'medium' as const, expected: 20 },
        { model: 'Claude' as const, complexity: 'high' as const, expected: 40 },
      ];

      testCases.forEach(({ model, complexity, expected }) => {
        const request: AIRequest = { model, complexity };
        const cost = tokenService.calculateRequestCost(request);
        expect(cost).toBe(expected);
      });
    });
  });

  describe('Workflow Cost Calculation', () => {
    test('should calculate total cost for multiple requests', () => {
      const requests: AIRequest[] = [
        { model: 'Claude', complexity: 'low' },
        { model: 'Gemini', complexity: 'medium' },
        { model: 'GPT5', complexity: 'high' }
      ];

      const totalCost = tokenService.calculateWorkflowCost(requests, 'small-app');

      // Base costs: 5 + 10 + 70 = 85
      // Feature multiplier: 85 * 1.4 = 119
      // Orchestration overhead: 119 * 0.075 ≈ 8.925 → 9
      // Total: 119 + 9 = 128
      expect(totalCost).toBe(128);
    });

    test('should apply correct feature multipliers', () => {
      const requests: AIRequest[] = [
        { model: 'Claude', complexity: 'medium' } // 20 tokens
      ];

      const testCases = [
        { feature: 'small-function', expected: Math.round(20 * 1.0 * 1.075) },
        { feature: 'ui-component', expected: Math.round(20 * 1.2 * 1.075) },
        { feature: 'complex-app', expected: Math.round(20 * 2.5 * 1.075) },
      ];

      testCases.forEach(({ feature, expected }) => {
        const cost = tokenService.calculateWorkflowCost(requests, feature);
        expect(cost).toBe(expected);
      });
    });

    test('should default to general feature when not specified', () => {
      const requests: AIRequest[] = [
        { model: 'Claude', complexity: 'medium' } // 20 tokens
      ];

      const cost = tokenService.calculateWorkflowCost(requests);
      expect(cost).toBe(Math.round(20 * 1.0 * 1.075)); // Default multiplier is 1.0
    });
  });

  describe('Action Permission Checking', () => {
    test('should allow action when user has sufficient tokens', async () => {
      const userId = 'test-user';
      const pool: TokenPool = {
        userId,
        monthlyTokens: 50000,
        usedTokens: 10000,
        resetDate: new Date(),
        rolloverTokens: 0,
        lastUpdated: new Date(),
        tier: 'free'
      };

      mockVectorStore.similaritySearch.mockResolvedValue([{ metadata: pool }]);

      const result = await tokenService.canPerformAction(userId, 5000); // 5000 < 40000 available

      expect(result).toEqual({ canProceed: true });
    });

    test('should deny action when user lacks tokens but has billing', async () => {
      const userId = 'test-user';
      const pool: TokenPool = {
        userId,
        monthlyTokens: 50000,
        usedTokens: 45000, // Only 5000 left
        resetDate: new Date(),
        rolloverTokens: 0,
        lastUpdated: new Date(),
        tier: 'free'
      };

      mockVectorStore.similaritySearch.mockResolvedValue([{ metadata: pool }]);
      mockBillingService.canPerformAction.mockResolvedValue({
        canProceed: true // User has valid billing
      });

      const result = await tokenService.canPerformAction(userId, 10000); // 10000 > 5000 available

      expect(result).toEqual({
        canProceed: false,
        reason: 'Insufficient tokens for this operation',
        paymentRequired: true
      });
    });
  });

  describe('Payment Integration', () => {
    test('should create payment intent for additional tokens', async () => {
      const userId = 'test-user';
      const tokenAmount = 10000;

      mockBillingService.createTokenPaymentIntent.mockResolvedValue({
        id: 'pi_test_id',
        client_secret: 'pi_test_secret',
        amount: 20,
        currency: 'usd',
        status: 'requires_payment_method'
      });

      const paymentIntent = await tokenService.createPaymentIntentForTokens(userId, tokenAmount);

      expect(mockBillingService.createTokenPaymentIntent).toHaveBeenCalledWith(userId, tokenAmount, undefined);
      expect(paymentIntent).toEqual({
        id: 'pi_test_id',
        client_secret: 'pi_test_secret',
        amount: 20,
        currency: 'usd',
        status: 'requires_payment_method'
      });
    });

    test('should get billing status correctly', async () => {
      const userId = 'test-user';
      const expectedStatus = {
        hasActiveSubscription: true,
        tier: 'pro',
        status: 'active',
        nextBillingDate: new Date()
      };

      mockBillingService.getSubscriptionStatus.mockResolvedValue({
        hasActiveSubscription: true,
        tier: 'pro',
        status: 'active',
        nextBillingDate: new Date()
      });

      const status = await tokenService.getBillingStatus(userId);

      expect(mockBillingService.getSubscriptionStatus).toHaveBeenCalledWith(userId, undefined);
      expect(status).toEqual(expectedStatus);
    });
  });
});
