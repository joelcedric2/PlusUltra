/**
 * Layer 3: Historical Pattern Matching - Integration Tests
 *
 * Tests pattern library lookup and similarity matching using GPT-4/5.
 * Validates known vulnerability detection and recommendation generation.
 */

import { HistoricalPatternService } from '../../src/services/tci/HistoricalPatternService';
import { prisma } from '../../src/lib/prisma';

describe('Layer 3: Historical Pattern Matching', () => {
  let historicalService: HistoricalPatternService;

  beforeAll(async () => {
    historicalService = new HistoricalPatternService();

    // Seed some test patterns
    await prisma.tCIPattern.createMany({
      data: [
        {
          name: 'SQL Injection via String Concatenation',
          category: 'vulnerability',
          severity: 'CRITICAL',
          description: 'Concatenating user input directly into SQL queries',
          exampleCode: `const query = "SELECT * FROM users WHERE id = '" + userId + "'";`,
          knownBugs: ['SQL injection allows unauthorized data access'],
          occurrenceCount: 150,
          accuracy: 0.95,
        },
        {
          name: 'Missing Null Check',
          category: 'bug',
          severity: 'MEDIUM',
          description: 'Accessing properties without null/undefined check',
          exampleCode: `function getName(user) { return user.name.toUpperCase(); }`,
          knownBugs: ['TypeError: Cannot read property of undefined'],
          occurrenceCount: 320,
          accuracy: 0.88,
        },
        {
          name: 'Hardcoded Credentials',
          category: 'vulnerability',
          severity: 'CRITICAL',
          description: 'API keys or passwords in source code',
          exampleCode: `const API_KEY = "sk-1234567890abcdef";`,
          knownBugs: ['Exposed credentials in version control'],
          occurrenceCount: 75,
          accuracy: 0.92,
        },
      ],
      skipDuplicates: true,
    });
  });

  afterAll(async () => {
    // Cleanup test patterns
    await prisma.tCIPattern.deleteMany({
      where: {
        name: {
          in: [
            'SQL Injection via String Concatenation',
            'Missing Null Check',
            'Hardcoded Credentials',
          ],
        },
      },
    });
  });

  describe('Pattern Matching', () => {
    it('should match SQL injection pattern', async () => {
      const code = `
function getUserByEmail(email: string) {
  const query = "SELECT * FROM users WHERE email = '" + email + "'";
  return db.execute(query);
}
      `.trim();

      const result = await historicalService.analyze(code, 'typescript');

      expect(result).toBeDefined();
      expect(result.thisCodeMatchesPattern).toBeDefined();

      // Should match SQL injection pattern
      expect(result.thisCodeMatchesPattern.toLowerCase()).toContain('sql');
    }, 30000);

    it('should find similar patterns from library', async () => {
      const code = `
function login(username, password) {
  const sql = "SELECT * FROM users WHERE user = '" + username + "' AND pass = '" + password + "'";
  return database.query(sql);
}
      `.trim();

      const result = await historicalService.analyze(code, 'typescript');

      expect(result.similarPatterns.length).toBeGreaterThan(0);

      // Should include SQL injection pattern
      const sqlPattern = result.similarPatterns.find(
        p => p.pattern.toLowerCase().includes('sql') ||
             p.description.toLowerCase().includes('sql')
      );
      expect(sqlPattern).toBeDefined();
    }, 30000);

    it('should detect null check missing pattern', async () => {
      const code = `
function displayUser(user) {
  console.log(user.profile.name);
}
      `.trim();

      const result = await historicalService.analyze(code, 'javascript');

      expect(result.commonMistakes.length).toBeGreaterThan(0);

      const nullCheckMistake = result.commonMistakes.find(
        m => m.toLowerCase().includes('null') || m.toLowerCase().includes('undefined')
      );
      expect(nullCheckMistake).toBeDefined();
    }, 30000);

    it('should detect hardcoded credentials', async () => {
      const code = `
const config = {
  apiKey: "sk-proj-abc123def456",
  database: "postgresql://user:password@localhost/db"
};
      `.trim();

      const result = await historicalService.analyze(code, 'typescript');

      const credentialPattern = result.similarPatterns.find(
        p => p.description.toLowerCase().includes('credential') ||
             p.description.toLowerCase().includes('api key')
      );
      expect(credentialPattern).toBeDefined();
    }, 30000);
  });

  describe('Known Bugs', () => {
    it('should list known bugs for matched patterns', async () => {
      const code = `
function processData(data) {
  return data.items.map(item => item.value);
}
      `.trim();

      const result = await historicalService.analyze(code, 'javascript');

      result.similarPatterns.forEach(pattern => {
        expect(pattern.knownBugs).toBeDefined();
        expect(Array.isArray(pattern.knownBugs)).toBe(true);
      });
    }, 30000);

    it('should include frequency information', async () => {
      const code = `
const query = "DELETE FROM users WHERE id = " + userId;
db.execute(query);
      `.trim();

      const result = await historicalService.analyze(code, 'typescript');

      result.similarPatterns.forEach(pattern => {
        expect(pattern.frequency).toBeGreaterThanOrEqual(0);
      });
    }, 30000);
  });

  describe('Recommendations', () => {
    it('should provide actionable recommendations', async () => {
      const code = `
function authenticate(token) {
  eval("validateToken('" + token + "')");
}
      `.trim();

      const result = await historicalService.analyze(code, 'javascript');

      expect(result.recommendations.length).toBeGreaterThan(0);

      result.recommendations.forEach(rec => {
        expect(rec).toBeDefined();
        expect(rec.length).toBeGreaterThan(0);
      });
    }, 30000);

    it('should suggest specific fixes for SQL injection', async () => {
      const code = `
function getUser(id) {
  return db.query("SELECT * FROM users WHERE id = " + id);
}
      `.trim();

      const result = await historicalService.analyze(code, 'javascript');

      const parameterizedQueryRec = result.recommendations.find(
        r => r.toLowerCase().includes('parameter') ||
             r.toLowerCase().includes('prepared')
      );
      expect(parameterizedQueryRec).toBeDefined();
    }, 30000);

    it('should suggest validation for user inputs', async () => {
      const code = `
function setUserAge(age) {
  user.age = age;
}
      `.trim();

      const result = await historicalService.analyze(code, 'javascript');

      const validationRec = result.recommendations.find(
        r => r.toLowerCase().includes('validat') || r.toLowerCase().includes('check')
      );
      expect(validationRec).toBeDefined();
    }, 30000);
  });

  describe('Common Mistakes', () => {
    it('should identify common anti-patterns', async () => {
      const code = `
async function fetchAllUsers() {
  const users = await db.users.findMany();
  for (let i = 0; i < users.length; i++) {
    await updateUser(users[i]);
  }
}
      `.trim();

      const result = await historicalService.analyze(code, 'typescript');

      expect(result.commonMistakes.length).toBeGreaterThan(0);

      // Should mention N+1 query or sequential await
      const performanceMistake = result.commonMistakes.find(
        m => m.toLowerCase().includes('sequential') ||
             m.toLowerCase().includes('n+1') ||
             m.toLowerCase().includes('parallel')
      );
      expect(performanceMistake).toBeDefined();
    }, 30000);

    it('should detect memory leaks', async () => {
      const code = `
const cache = {};
function cacheData(key, value) {
  cache[key] = value; // Never cleaned up
}
      `.trim();

      const result = await historicalService.analyze(code, 'javascript');

      const memoryLeakMistake = result.commonMistakes.find(
        m => m.toLowerCase().includes('memory') || m.toLowerCase().includes('leak')
      );
      expect(memoryLeakMistake).toBeDefined();
    }, 30000);
  });

  describe('Confidence Scoring', () => {
    it('should have higher confidence for well-known patterns', async () => {
      const wellKnownPattern = `
const password = "admin123";
const apiKey = "sk-1234567890";
      `.trim();

      const result = await historicalService.analyze(wellKnownPattern, 'javascript');

      expect(result.confidence).toBeGreaterThan(0.7);
    }, 30000);

    it('should include timing information', async () => {
      const code = `function test() { return true; }`;

      const result = await historicalService.analyze(code, 'typescript');

      expect(result.timing).toBeGreaterThan(0);
      expect(result.timing).toBeLessThan(60000);
    }, 30000);
  });

  describe('Pattern Library Integration', () => {
    it('should query database for similar patterns', async () => {
      const code = `
const query = "INSERT INTO logs VALUES ('" + userInput + "')";
      `.trim();

      const result = await historicalService.analyze(code, 'typescript');

      // Should find patterns from database
      expect(result.similarPatterns.length).toBeGreaterThan(0);
    }, 30000);

    it('should use Pinecone for semantic similarity if available', async () => {
      const code = `
function processPayment(amount, cardNumber) {
  console.log("Processing payment:", cardNumber);
}
      `.trim();

      const result = await historicalService.analyze(code, 'javascript');

      // Should find patterns even if not exact match
      expect(result).toBeDefined();
      expect(result.similarPatterns).toBeDefined();
    }, 30000);
  });

  describe('Multi-Language Support', () => {
    it('should analyze Python code', async () => {
      const pythonCode = `
def get_user(email):
    query = f"SELECT * FROM users WHERE email = '{email}'"
    return db.execute(query)
      `.trim();

      const result = await historicalService.analyze(pythonCode, 'python');

      expect(result).toBeDefined();
      expect(result.similarPatterns.length).toBeGreaterThan(0);
    }, 30000);

    it('should analyze Go code', async () => {
      const goCode = `
func getUser(id string) {
    query := "SELECT * FROM users WHERE id = '" + id + "'"
    db.Exec(query)
}
      `.trim();

      const result = await historicalService.analyze(goCode, 'go');

      expect(result).toBeDefined();
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle code with no matches gracefully', async () => {
      const uniqueCode = `
function calculateFibonacci(n: number): number {
  return n <= 1 ? n : calculateFibonacci(n - 1) + calculateFibonacci(n - 2);
}
      `.trim();

      const result = await historicalService.analyze(uniqueCode, 'typescript');

      expect(result).toBeDefined();
      expect(result.similarPatterns).toBeDefined();
      // May be empty, but shouldn't error
    }, 30000);

    it('should handle invalid code', async () => {
      const invalidCode = 'this is not valid code }{][';

      const result = await historicalService.analyze(invalidCode, 'typescript');

      expect(result).toBeDefined();
    }, 30000);
  });
});
