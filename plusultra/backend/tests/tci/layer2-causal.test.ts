/**
 * Layer 2: Causal Chain Analysis - Integration Tests
 *
 * Tests causal chain prediction using Claude 4.5.
 * Validates breaking change detection and impact assessment.
 */

import { CausalChainAnalysisService } from '../../src/services/tci/CausalChainAnalysisService';

describe('Layer 2: Causal Chain Analysis', () => {
  let causalService: CausalChainAnalysisService;

  beforeAll(() => {
    causalService = new CausalChainAnalysisService();
  });

  describe('Breaking Change Detection', () => {
    it('should detect API breaking changes', async () => {
      const originalCode = `
export function calculatePrice(quantity: number): number {
  return quantity * 10;
}
      `.trim();

      const proposedChange = `
export function calculatePrice(quantity: number, discount: number): number {
  return quantity * 10 * (1 - discount);
}
      `.trim();

      const result = await causalService.analyze(
        proposedChange,
        'typescript',
        undefined,
        proposedChange
      );

      expect(result).toBeDefined();
      expect(result.breakingChanges.length).toBeGreaterThan(0);

      // Should detect signature change
      const signatureChange = result.breakingChanges.find(
        bc => bc.toLowerCase().includes('signature') || bc.toLowerCase().includes('parameter')
      );
      expect(signatureChange).toBeDefined();
    }, 30000);

    it('should detect return type changes', async () => {
      const code = `
// Changed from returning string to number
export function getUserAge(userId: string): number {
  return 25; // Was: return "25"
}
      `.trim();

      const result = await causalService.analyze(code, 'typescript');

      expect(result.breakingChanges.length).toBeGreaterThan(0);
    }, 30000);

    it('should detect removed exports', async () => {
      const code = `
// This function was removed from public API
// export function deprecatedFunction() {}

export function newFunction() {}
      `.trim();

      const result = await causalService.analyze(
        code,
        'typescript',
        undefined,
        'Removed deprecatedFunction from API'
      );

      expect(result.breakingChanges.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Causal Chain Prediction', () => {
    it('should predict multi-step consequences', async () => {
      const code = `
// Changing database schema
export async function migrateUserTable() {
  await db.execute("ALTER TABLE users DROP COLUMN email");
}
      `.trim();

      const result = await causalService.analyze(code, 'typescript');

      expect(result.chain.length).toBeGreaterThan(0);

      // Should have multiple steps
      expect(result.chain.length).toBeGreaterThanOrEqual(2);

      // Each step should have description and impact
      result.chain.forEach(step => {
        expect(step.description).toBeDefined();
        expect(step.description.length).toBeGreaterThan(0);
        expect(step.impactLevel).toMatch(/LOW|MEDIUM|HIGH/);
        expect(step.likelihood).toBeGreaterThan(0);
        expect(step.likelihood).toBeLessThanOrEqual(1);
      });
    }, 30000);

    it('should identify affected files', async () => {
      const code = `
// Changing shared utility function
export function formatDate(date: Date): string {
  return date.toISOString(); // Changed format
}
      `.trim();

      const result = await causalService.analyze(
        code,
        'typescript',
        'src/utils/date.ts'
      );

      expect(result.chain.some(step => step.affectedFiles.length > 0)).toBe(true);
    }, 30000);

    it('should calculate likelihood scores', async () => {
      const code = `
function updateUserEmail(userId: string, newEmail: string) {
  db.execute("UPDATE users SET email = ? WHERE id = ?", [newEmail, userId]);
}
      `.trim();

      const result = await causalService.analyze(code, 'typescript');

      result.chain.forEach(step => {
        expect(step.likelihood).toBeGreaterThanOrEqual(0);
        expect(step.likelihood).toBeLessThanOrEqual(1);
      });
    }, 30000);
  });

  describe('Risk Assessment', () => {
    it('should assess immediate risk', async () => {
      const dangerousCode = `
function deleteAllUsers() {
  db.execute("DROP TABLE users");
}
      `.trim();

      const result = await causalService.analyze(dangerousCode, 'typescript');

      expect(result.riskAssessment).toBeDefined();
      expect(result.riskAssessment.immediate).toBeGreaterThan(5); // High immediate risk
      expect(result.riskAssessment.immediate).toBeLessThanOrEqual(10);
    }, 30000);

    it('should assess short-term and long-term risk', async () => {
      const code = `
// Technical debt: hardcoded values
const API_KEY = "sk-1234567890";
const MAX_RETRIES = 3;
      `.trim();

      const result = await causalService.analyze(code, 'typescript');

      expect(result.riskAssessment.shortTerm).toBeGreaterThanOrEqual(0);
      expect(result.riskAssessment.shortTerm).toBeLessThanOrEqual(10);
      expect(result.riskAssessment.longTerm).toBeGreaterThanOrEqual(0);
      expect(result.riskAssessment.longTerm).toBeLessThanOrEqual(10);
    }, 30000);

    it('should have higher long-term risk for technical debt', async () => {
      const technicalDebt = `
// TODO: Refactor this spaghetti code
function processData(data: any) {
  // 500 lines of unmaintainable code
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data[i].items.length; j++) {
      // Nested loops, no abstractions
    }
  }
}
      `.trim();

      const result = await causalService.analyze(technicalDebt, 'typescript');

      // Technical debt has higher long-term risk
      expect(result.riskAssessment.longTerm).toBeGreaterThan(
        result.riskAssessment.immediate
      );
    }, 30000);
  });

  describe('Impact Level Classification', () => {
    it('should classify high impact changes', async () => {
      const highImpact = `
// Changing authentication system
export function authenticate(token: string): boolean {
  return true; // Always return true (CRITICAL ISSUE)
}
      `.trim();

      const result = await causalService.analyze(highImpact, 'typescript');

      const highImpactSteps = result.chain.filter(step => step.impactLevel === 'HIGH');
      expect(highImpactSteps.length).toBeGreaterThan(0);
    }, 30000);

    it('should classify low impact changes', async () => {
      const lowImpact = `
// Internal logging change
function log(message: string) {
  console.log("[INFO]", message); // Added prefix
}
      `.trim();

      const result = await causalService.analyze(lowImpact, 'typescript');

      const lowImpactSteps = result.chain.filter(step => step.impactLevel === 'LOW');
      expect(lowImpactSteps.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Confidence and Timing', () => {
    it('should include confidence score', async () => {
      const code = `function test() { return true; }`;

      const result = await causalService.analyze(code, 'typescript');

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }, 30000);

    it('should include timing information', async () => {
      const code = `function test() { return true; }`;

      const result = await causalService.analyze(code, 'typescript');

      expect(result.timing).toBeGreaterThan(0);
      expect(result.timing).toBeLessThan(60000);
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid code', async () => {
      const invalidCode = 'this is not valid code }{][';

      const result = await causalService.analyze(invalidCode, 'typescript');

      expect(result).toBeDefined();
      expect(result.chain).toBeDefined();
    }, 30000);

    it('should handle code without changes', async () => {
      const simpleCode = `const x = 1;`;

      const result = await causalService.analyze(simpleCode, 'typescript');

      expect(result).toBeDefined();
      expect(result.chain).toBeDefined();
    }, 30000);
  });

  describe('Proposed Change Analysis', () => {
    it('should analyze with proposed change context', async () => {
      const code = `
export function getUserById(id: string): Promise<User> {
  return db.users.findUnique({ where: { id } });
}
      `.trim();

      const proposedChange = 'Add caching layer to reduce database calls';

      const result = await causalService.analyze(
        code,
        'typescript',
        undefined,
        proposedChange
      );

      expect(result.chain.length).toBeGreaterThan(0);

      // Should consider caching implications
      const cachingStep = result.chain.find(
        step => step.description.toLowerCase().includes('cach')
      );
      expect(cachingStep).toBeDefined();
    }, 30000);
  });
});
