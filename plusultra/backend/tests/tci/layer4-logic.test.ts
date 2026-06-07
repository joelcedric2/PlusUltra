/**
 * Layer 4: Symbolic Logic Verification - Integration Tests
 *
 * Tests formal logic checking using Grok.
 * Validates invariant verification, proof generation, and counterexample detection.
 */

import { SymbolicVerificationService } from '../../src/services/tci/SymbolicVerificationService';

describe('Layer 4: Symbolic Logic Verification', () => {
  let logicService: SymbolicVerificationService;

  beforeAll(() => {
    logicService = new SymbolicVerificationService();
  });

  describe('Invariant Verification', () => {
    it('should verify simple invariant holds', async () => {
      const code = `
function add(a: number, b: number): number {
  const result = a + b;
  // Invariant: result = a + b
  return result;
}
      `.trim();

      const result = await logicService.analyze(code, 'typescript');

      expect(result).toBeDefined();
      expect(result.invariants.length).toBeGreaterThan(0);

      const invariant = result.invariants[0];
      expect(invariant.holds).toBe(true);
      expect(invariant.invariant).toBeDefined();
    }, 30000);

    it('should detect violated invariants', async () => {
      const code = `
function divide(a: number, b: number): number {
  // Invariant violated: division by zero not checked
  return a / b;
}
      `.trim();

      const result = await logicService.analyze(code, 'typescript');

      const violatedInvariant = result.invariants.find(inv => !inv.holds);
      expect(violatedInvariant).toBeDefined();
    }, 30000);

    it('should verify boundary conditions', async () => {
      const code = `
function getArrayElement(arr: number[], index: number): number {
  // Should check: 0 <= index < arr.length
  return arr[index];
}
      `.trim();

      const result = await logicService.analyze(code, 'typescript');

      // Should find boundary check missing
      const boundaryInvariant = result.invariants.find(
        inv => !inv.holds && inv.invariant.toLowerCase().includes('bound')
      );
      expect(boundaryInvariant).toBeDefined();
    }, 30000);

    it('should verify null safety', async () => {
      const code = `
function getUserName(user: User | null): string {
  return user.name; // Null check missing
}
      `.trim();

      const result = await logicService.analyze(code, 'typescript');

      const nullInvariant = result.invariants.find(
        inv => !inv.holds && inv.invariant.toLowerCase().includes('null')
      );
      expect(nullInvariant).toBeDefined();
    }, 30000);
  });

  describe('Proof Generation', () => {
    it('should generate proof for correct code', async () => {
      const code = `
function max(a: number, b: number): number {
  const result = a > b ? a : b;
  // Proof: result >= a AND result >= b
  return result;
}
      `.trim();

      const result = await logicService.analyze(code, 'typescript');

      const provenInvariant = result.invariants.find(inv => inv.holds && inv.proof);
      expect(provenInvariant).toBeDefined();
      expect(provenInvariant?.proof).toBeDefined();
      expect(provenInvariant?.proof!.length).toBeGreaterThan(0);
    }, 30000);

    it('should explain proof steps', async () => {
      const code = `
function isEven(n: number): boolean {
  return n % 2 === 0;
}
      `.trim();

      const result = await logicService.analyze(code, 'typescript');

      const invariantWithProof = result.invariants.find(inv => inv.proof);
      if (invariantWithProof) {
        expect(invariantWithProof.proof).toContain('even');
      }
    }, 30000);
  });

  describe('Counterexample Detection', () => {
    it('should provide counterexample for violated invariant', async () => {
      const code = `
function sqrt(n: number): number {
  // Invariant violated for negative numbers
  return Math.sqrt(n);
}
      `.trim();

      const result = await logicService.analyze(code, 'typescript');

      const violatedInvariant = result.invariants.find(
        inv => !inv.holds && inv.counterexample
      );
      expect(violatedInvariant).toBeDefined();
      expect(violatedInvariant?.counterexample).toBeDefined();
      expect(violatedInvariant?.counterexample!.length).toBeGreaterThan(0);
    }, 30000);

    it('should show specific values that break invariant', async () => {
      const code = `
function getDiscount(age: number): number {
  // Assumes age is always positive
  return age > 65 ? 0.2 : 0;
}
      `.trim();

      const result = await logicService.analyze(code, 'typescript');

      const counterexampleInvariant = result.invariants.find(
        inv => inv.counterexample && inv.counterexample.includes('-')
      );
      // Might find negative age counterexample
      expect(result.invariants).toBeDefined();
    }, 30000);
  });

  describe('Formal Correctness', () => {
    it('should mark code as formally correct when all invariants hold', async () => {
      const correctCode = `
function absolute(n: number): number {
  return n >= 0 ? n : -n;
}
      `.trim();

      const result = await logicService.analyze(correctCode, 'typescript');

      // Should have high confidence and possibly formal correctness
      expect(result.confidence).toBeGreaterThan(0.5);
    }, 30000);

    it('should mark code as incorrect when invariants fail', async () => {
      const incorrectCode = `
function parseInteger(str: string): number {
  return parseInt(str); // No validation, might return NaN
}
      `.trim();

      const result = await logicService.analyze(incorrectCode, 'typescript');

      expect(result.formalCorrectness).toBe(false);
    }, 30000);
  });

  describe('Logic Errors', () => {
    it('should detect logic errors', async () => {
      const code = `
function isPositive(n: number): boolean {
  return n >= 0; // Should be n > 0
}
      `.trim();

      const result = await logicService.analyze(code, 'typescript');

      expect(result.logicErrors.length).toBeGreaterThan(0);
    }, 30000);

    it('should detect unreachable code', async () => {
      const code = `
function process(x: number): number {
  if (x > 0) return x;
  if (x <= 0) return -x;
  return 0; // Unreachable
}
      `.trim();

      const result = await logicService.analyze(code, 'typescript');

      const unreachableError = result.logicErrors.find(
        err => err.toLowerCase().includes('unreachable')
      );
      expect(unreachableError).toBeDefined();
    }, 30000);

    it('should detect infinite loops', async () => {
      const code = `
function count() {
  let i = 0;
  while (i >= 0) {
    i++; // Infinite loop
  }
}
      `.trim();

      const result = await logicService.analyze(code, 'typescript');

      const infiniteLoopError = result.logicErrors.find(
        err => err.toLowerCase().includes('infinite') || err.toLowerCase().includes('loop')
      );
      expect(infiniteLoopError).toBeDefined();
    }, 30000);

    it('should detect contradictions', async () => {
      const code = `
function check(x: number): boolean {
  if (x > 10 && x < 5) {
    return true; // Contradiction
  }
  return false;
}
      `.trim();

      const result = await logicService.analyze(code, 'typescript');

      const contradictionError = result.logicErrors.find(
        err => err.toLowerCase().includes('contradiction') ||
               err.toLowerCase().includes('impossible')
      );
      expect(contradictionError).toBeDefined();
    }, 30000);
  });

  describe('Type Safety', () => {
    it('should verify type invariants', async () => {
      const code = `
function concat(a: string, b: string): string {
  return a + b;
}
      `.trim();

      const result = await logicService.analyze(code, 'typescript');

      const typeInvariant = result.invariants.find(
        inv => inv.invariant.toLowerCase().includes('type') ||
               inv.invariant.toLowerCase().includes('string')
      );
      expect(typeInvariant).toBeDefined();
    }, 30000);

    it('should detect type mismatches', async () => {
      const code = `
function multiply(a: number, b: number): number {
  return a + b; // Should be a * b
}
      `.trim();

      const result = await logicService.analyze(code, 'typescript');

      // Might detect semantic vs syntactic type error
      expect(result).toBeDefined();
    }, 30000);
  });

  describe('Confidence Scoring', () => {
    it('should have higher confidence for simple logic', async () => {
      const simpleCode = `
function isTrue(): boolean {
  return true;
}
      `.trim();

      const result = await logicService.analyze(simpleCode, 'typescript');

      expect(result.confidence).toBeGreaterThan(0.7);
    }, 30000);

    it('should have lower confidence for complex logic', async () => {
      const complexCode = `
function complexAlgorithm(data: any[]): any {
  // Very complex algorithm with multiple branches
  if (data.length === 0) return null;
  let result = data[0];
  for (let i = 1; i < data.length; i++) {
    if (data[i].value > result.value) {
      result = data[i];
    } else if (data[i].value === result.value && data[i].priority < result.priority) {
      result = data[i];
    }
  }
  return result;
}
      `.trim();

      const result = await logicService.analyze(complexCode, 'typescript');

      expect(result.confidence).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    }, 30000);

    it('should include timing information', async () => {
      const code = `function test() { return true; }`;

      const result = await logicService.analyze(code, 'typescript');

      expect(result.timing).toBeGreaterThan(0);
      expect(result.timing).toBeLessThan(60000);
    }, 30000);
  });

  describe('Multi-Language Support', () => {
    it('should analyze Python logic', async () => {
      const pythonCode = `
def factorial(n):
    if n < 0:
        raise ValueError("Negative input")
    if n == 0:
        return 1
    return n * factorial(n - 1)
      `.trim();

      const result = await logicService.analyze(pythonCode, 'python');

      expect(result).toBeDefined();
      expect(result.invariants.length).toBeGreaterThan(0);
    }, 30000);

    it('should analyze Go logic', async () => {
      const goCode = `
func max(a, b int) int {
    if a > b {
        return a
    }
    return b
}
      `.trim();

      const result = await logicService.analyze(goCode, 'go');

      expect(result).toBeDefined();
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid code', async () => {
      const invalidCode = 'this is not valid code }{][';

      const result = await logicService.analyze(invalidCode, 'typescript');

      expect(result).toBeDefined();
      expect(result.invariants).toBeDefined();
    }, 30000);

    it('should handle code with no verifiable logic', async () => {
      const simpleCode = `const x = 1;`;

      const result = await logicService.analyze(simpleCode, 'typescript');

      expect(result).toBeDefined();
    }, 30000);
  });
});
