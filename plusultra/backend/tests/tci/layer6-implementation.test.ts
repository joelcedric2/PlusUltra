/**
 * Layer 6: Implementation - Integration Tests
 *
 * Tests automatic fix generation using Claude 4.5.
 * Validates code improvements, change tracking, and test validation.
 */

import { ClaudeImplementationService } from '../../src/services/tci/ClaudeImplementationService';
import type { TCIVerdict } from '../../src/services/tci/types';

describe('Layer 6: Implementation', () => {
  let implementationService: ClaudeImplementationService;

  beforeAll(() => {
    implementationService = new ClaudeImplementationService();
  });

  // Helper to create mock verdict
  const createMockVerdict = (verdict: 'SHIP' | 'REFACTOR' | 'REJECT'): TCIVerdict => ({
    verdict,
    confidence: 0.9,
    synthesizedRisk: {
      overall: verdict === 'REJECT' ? 9 : verdict === 'REFACTOR' ? 5 : 2,
      breakdown: {
        security: verdict === 'REJECT' ? 9 : 3,
        performance: 4,
        maintainability: verdict === 'REFACTOR' ? 7 : 3,
        correctness: verdict === 'REJECT' ? 8 : 2,
      },
    },
    modelAgreements: [],
    consensusStrength: 0.85,
    conflicts: [],
    actionableSteps: verdict === 'REJECT'
      ? ['Fix SQL injection', 'Add input validation']
      : verdict === 'REFACTOR'
      ? ['Improve error handling', 'Add type safety']
      : [],
    timing: 3000,
  });

  describe('Fix Generation', () => {
    it('should fix SQL injection vulnerability', async () => {
      const vulnerableCode = `
function getUserByEmail(email: string) {
  const query = "SELECT * FROM users WHERE email = '" + email + "'";
  return db.execute(query);
}
      `.trim();

      const verdict = createMockVerdict('REJECT');
      verdict.actionableSteps = ['Use parameterized queries to prevent SQL injection'];

      const result = await implementationService.implement(vulnerableCode, 'typescript', verdict);

      expect(result).toBeDefined();
      expect(result.improvedCode).toBeDefined();
      expect(result.improvedCode).not.toBe(vulnerableCode);

      // Should use parameterized query
      expect(result.improvedCode.toLowerCase()).toMatch(/prepare|parameter|\?|\$/);
    }, 30000);

    it('should add null checks', async () => {
      const unsafeCode = `
function getUserName(user) {
  return user.name.toUpperCase();
}
      `.trim();

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Add null/undefined checks'];

      const result = await implementationService.implement(unsafeCode, 'javascript', verdict);

      expect(result.improvedCode).toBeDefined();
      // Should add null check
      expect(result.improvedCode.toLowerCase()).toMatch(/if|&&|\?\.|\|\|/);
    }, 30000);

    it('should add error handling', async () => {
      const code = `
async function fetchData(url: string) {
  const response = await fetch(url);
  return response.json();
}
      `.trim();

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Add error handling for network failures'];

      const result = await implementationService.implement(code, 'typescript', verdict);

      expect(result.improvedCode).toBeDefined();
      // Should add try-catch or error handling
      expect(result.improvedCode.toLowerCase()).toMatch(/try|catch|error/);
    }, 30000);

    it('should add input validation', async () => {
      const code = `
function setUserAge(age: number) {
  user.age = age;
}
      `.trim();

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Validate age is positive'];

      const result = await implementationService.implement(code, 'typescript', verdict);

      expect(result.improvedCode).toBeDefined();
      // Should add validation
      expect(result.improvedCode.toLowerCase()).toMatch(/if|validate|check|>|>=/);
    }, 30000);
  });

  describe('Change Tracking', () => {
    it('should track code changes', async () => {
      const code = `
function divide(a: number, b: number) {
  return a / b;
}
      `.trim();

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Add division by zero check'];

      const result = await implementationService.implement(code, 'typescript', verdict);

      expect(result.changes).toBeDefined();
      expect(result.changes.length).toBeGreaterThan(0);
    }, 30000);

    it('should categorize changes as add/remove/modify', async () => {
      const code = `
function test() {
  return true;
}
      `.trim();

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Add documentation'];

      const result = await implementationService.implement(code, 'typescript', verdict);

      result.changes.forEach(change => {
        expect(change.type).toMatch(/add|remove|modify/);
        expect(change.line).toBeGreaterThan(0);
        expect(change.reason).toBeDefined();
      });
    }, 30000);

    it('should provide reason for each change', async () => {
      const code = `const x = 1;`;

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Improve code quality'];

      const result = await implementationService.implement(code, 'typescript', verdict);

      result.changes.forEach(change => {
        expect(change.reason).toBeDefined();
        expect(change.reason.length).toBeGreaterThan(0);
      });
    }, 30000);

    it('should show before/after for modifications', async () => {
      const code = `
function add(a, b) {
  return a + b;
}
      `.trim();

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Add type annotations'];

      const result = await implementationService.implement(code, 'javascript', verdict);

      const modifyChanges = result.changes.filter(c => c.type === 'modify');
      modifyChanges.forEach(change => {
        if (change.before && change.after) {
          expect(change.before).not.toBe(change.after);
        }
      });
    }, 30000);
  });

  describe('Test Validation', () => {
    it('should mark tests as passed for simple fixes', async () => {
      const code = `
function isEven(n: number): boolean {
  return n % 2 === 0;
}
      `.trim();

      const verdict = createMockVerdict('SHIP');
      verdict.actionableSteps = ['Add input validation for negative numbers'];

      const result = await implementationService.implement(code, 'typescript', verdict);

      expect(result.testsPassed).toBeDefined();
      // Simple cases should pass
    }, 30000);

    it('should handle test failures gracefully', async () => {
      const complexCode = `
function complexAlgorithm(data: any[]): any {
  // Very complex code that might break
  return data.reduce((acc, item) => acc + item.value, 0);
}
      `.trim();

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Improve type safety'];

      const result = await implementationService.implement(complexCode, 'typescript', verdict);

      expect(result.testsPassed).toBeDefined();
    }, 30000);
  });

  describe('Confidence Scoring', () => {
    it('should have high confidence for simple fixes', async () => {
      const code = `
function add(a: number, b: number) {
  return a + b;
}
      `.trim();

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Add JSDoc comment'];

      const result = await implementationService.implement(code, 'typescript', verdict);

      expect(result.confidence).toBeGreaterThan(0.7);
    }, 30000);

    it('should have lower confidence for complex fixes', async () => {
      const complexCode = `
class ComplexSystem {
  private state: any;
  // 50 methods with complex interdependencies
}
      `.trim();

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Refactor state management'];

      const result = await implementationService.implement(complexCode, 'typescript', verdict);

      expect(result.confidence).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    }, 30000);

    it('should include timing information', async () => {
      const code = `const x = 1;`;
      const verdict = createMockVerdict('REFACTOR');

      const result = await implementationService.implement(code, 'typescript', verdict);

      expect(result.timing).toBeGreaterThan(0);
      expect(result.timing).toBeLessThan(60000);
    }, 30000);
  });

  describe('Code Quality', () => {
    it('should maintain or improve code formatting', async () => {
      const code = `
function test(x: number): number {
  return x * 2;
}
      `.trim();

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Add validation'];

      const result = await implementationService.implement(code, 'typescript', verdict);

      // Should have proper indentation
      expect(result.improvedCode).toMatch(/\n\s+/);
    }, 30000);

    it('should preserve code semantics', async () => {
      const code = `
function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
      `.trim();

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Add input validation'];

      const result = await implementationService.implement(code, 'typescript', verdict);

      // Should still be a factorial function
      expect(result.improvedCode.toLowerCase()).toContain('factorial');
    }, 30000);

    it('should add helpful comments', async () => {
      const code = `
function process(data: any[]) {
  return data.filter(x => x.active).map(x => x.value);
}
      `.trim();

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Improve code documentation'];

      const result = await implementationService.implement(code, 'typescript', verdict);

      // Should add comments
      expect(result.improvedCode).toMatch(/\/\/|\/\*/);
    }, 30000);
  });

  describe('Multi-Language Support', () => {
    it('should fix Python code', async () => {
      const pythonCode = `
def get_user(email):
    query = f"SELECT * FROM users WHERE email = '{email}'"
    return db.execute(query)
      `.trim();

      const verdict = createMockVerdict('REJECT');
      verdict.actionableSteps = ['Fix SQL injection'];

      const result = await implementationService.implement(pythonCode, 'python', verdict);

      expect(result.improvedCode).toBeDefined();
      // Should use parameterized query
      expect(result.improvedCode).toMatch(/%s|\?/);
    }, 30000);

    it('should fix Go code', async () => {
      const goCode = `
func divide(a, b int) int {
    return a / b
}
      `.trim();

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Add division by zero check'];

      const result = await implementationService.implement(goCode, 'go', verdict);

      expect(result.improvedCode).toBeDefined();
    }, 30000);
  });

  describe('Edge Cases', () => {
    it('should handle SHIP verdict with minimal changes', async () => {
      const goodCode = `
function multiply(a: number, b: number): number {
  return a * b;
}
      `.trim();

      const verdict = createMockVerdict('SHIP');
      verdict.actionableSteps = []; // No changes needed

      const result = await implementationService.implement(goodCode, 'typescript', verdict);

      // Should make minimal or no changes
      expect(result.improvedCode).toBeDefined();
      expect(result.changes.length).toBeLessThanOrEqual(2); // At most minor improvements
    }, 30000);

    it('should handle empty actionable steps', async () => {
      const code = `const x = 1;`;
      const verdict = createMockVerdict('SHIP');
      verdict.actionableSteps = [];

      const result = await implementationService.implement(code, 'typescript', verdict);

      expect(result).toBeDefined();
      expect(result.improvedCode).toBeDefined();
    }, 30000);

    it('should handle very long code', async () => {
      const longCode = Array(100)
        .fill(0)
        .map((_, i) => `function func${i}() { return ${i}; }`)
        .join('\n');

      const verdict = createMockVerdict('REFACTOR');
      verdict.actionableSteps = ['Add type annotations'];

      const result = await implementationService.implement(longCode, 'typescript', verdict);

      expect(result).toBeDefined();
    }, 60000); // Longer timeout
  });
});
