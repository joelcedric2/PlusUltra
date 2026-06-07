/**
 * Layer 1: Visual Pattern Recognition - Integration Tests
 *
 * Tests the visual code analysis using DeepSeek Vision.
 * Validates pattern detection, code health scoring, and screenshot generation.
 */

import { VisualCodeAnalysisService } from '../../src/services/tci/VisualCodeAnalysisService';
import { CodeToImageRenderer } from '../../src/services/tci/CodeToImageRenderer';

describe('Layer 1: Visual Pattern Recognition', () => {
  let visualService: VisualCodeAnalysisService;
  let renderer: CodeToImageRenderer;

  beforeAll(async () => {
    visualService = new VisualCodeAnalysisService();
    renderer = new CodeToImageRenderer();
    await renderer.initialize();
  });

  afterAll(async () => {
    await renderer.close();
  });

  describe('Code to Image Rendering', () => {
    it('should render TypeScript code to image', async () => {
      const code = `
function getUserById(id: string) {
  const query = "SELECT * FROM users WHERE id = '" + id + "'";
  return db.execute(query);
}
      `.trim();

      const screenshot = await renderer.renderCode(code, 'typescript');

      expect(screenshot).toBeDefined();
      expect(screenshot.length).toBeGreaterThan(0);
      expect(screenshot.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('should handle syntax highlighting for different languages', async () => {
      const pythonCode = `
def get_user(email):
    query = f"SELECT * FROM users WHERE email = '{email}'"
    return db.execute(query)
      `.trim();

      const screenshot = await renderer.renderCode(pythonCode, 'python');

      expect(screenshot).toBeDefined();
      expect(screenshot.length).toBeGreaterThan(0);
    });

    it('should handle empty code gracefully', async () => {
      await expect(renderer.renderCode('', 'typescript')).rejects.toThrow();
    });
  });

  describe('Visual Pattern Detection', () => {
    it('should detect SQL injection pattern visually', async () => {
      const vulnerableCode = `
function login(username: string, password: string) {
  const query = "SELECT * FROM users WHERE username = '" + username + "' AND password = '" + password + "'";
  const result = db.execute(query);
  return result.rows.length > 0;
}
      `.trim();

      const result = await visualService.analyze(vulnerableCode, 'typescript');

      expect(result).toBeDefined();
      expect(result.visualPatterns.length).toBeGreaterThan(0);

      // Should detect SQL injection pattern
      const sqlInjectionPattern = result.visualPatterns.find(
        p => p.type.toLowerCase().includes('sql') || p.type.toLowerCase().includes('injection')
      );
      expect(sqlInjectionPattern).toBeDefined();
      expect(sqlInjectionPattern?.severity).toBe('CRITICAL');
    }, 30000); // 30s timeout for AI call

    it('should calculate code health score', async () => {
      const cleanCode = `
function calculateTotal(items: Array<{ price: number; quantity: number }>): number {
  return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}
      `.trim();

      const result = await visualService.analyze(cleanCode, 'typescript');

      expect(result.overallCodeHealth).toBeGreaterThanOrEqual(0);
      expect(result.overallCodeHealth).toBeLessThanOrEqual(10);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }, 30000);

    it('should detect multiple patterns in complex code', async () => {
      const complexCode = `
function processUserData(userData: string) {
  // Potential issues:
  // 1. SQL injection
  // 2. No input validation
  // 3. Unsafe eval
  // 4. No error handling

  const query = "INSERT INTO users VALUES ('" + userData + "')";
  db.execute(query);

  eval(userData); // Very dangerous

  return true;
}
      `.trim();

      const result = await visualService.analyze(complexCode, 'typescript');

      expect(result.visualPatterns.length).toBeGreaterThanOrEqual(2);

      // Should detect multiple critical issues
      const criticalPatterns = result.visualPatterns.filter(
        p => p.severity === 'CRITICAL'
      );
      expect(criticalPatterns.length).toBeGreaterThan(0);
    }, 30000);

    it('should provide location information for patterns', async () => {
      const code = `
const userInput = getUserInput();
const query = "DELETE FROM users WHERE id = " + userInput;
db.execute(query);
      `.trim();

      const result = await visualService.analyze(code, 'typescript');

      result.visualPatterns.forEach(pattern => {
        expect(pattern.location).toBeDefined();
        expect(pattern.location.line).toBeGreaterThan(0);
        expect(pattern.description).toBeDefined();
        expect(pattern.description.length).toBeGreaterThan(0);
      });
    }, 30000);
  });

  describe('Confidence Scoring', () => {
    it('should have higher confidence for clear patterns', async () => {
      const obviousIssue = `
function deleteUser(id: string) {
  eval("db.execute('DELETE FROM users WHERE id = " + id + "')");
}
      `.trim();

      const result = await visualService.analyze(obviousIssue, 'typescript');

      // Clear pattern should have high confidence
      expect(result.confidence).toBeGreaterThan(0.7);
    }, 30000);

    it('should include timing information', async () => {
      const code = `function test() { return true; }`;

      const result = await visualService.analyze(code, 'typescript');

      expect(result.timing).toBeGreaterThan(0);
      expect(result.timing).toBeLessThan(60000); // Should complete within 60s
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid code gracefully', async () => {
      const invalidCode = 'this is not valid code }{][';

      // Should not throw, but may return low confidence or no patterns
      const result = await visualService.analyze(invalidCode, 'typescript');

      expect(result).toBeDefined();
      expect(result.confidence).toBeDefined();
    }, 30000);

    it('should handle very large code files', async () => {
      // Generate large code file (1000 lines)
      const largeCode = Array(1000)
        .fill(0)
        .map((_, i) => `function func${i}() { return ${i}; }`)
        .join('\n');

      const result = await visualService.analyze(largeCode, 'typescript');

      expect(result).toBeDefined();
    }, 60000); // Longer timeout for large file
  });

  describe('Screenshot Generation', () => {
    it('should include screenshot in result', async () => {
      const code = `console.log("Hello World");`;

      const result = await visualService.analyze(code, 'typescript');

      expect(result.screenshot).toBeDefined();
      expect(result.screenshot?.startsWith('data:image/png;base64,')).toBe(true);
    }, 30000);
  });
});
