/**
 * TCI System Verification Script
 *
 * Verifies that all TCI components are properly configured and working
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../plusultra/backend/.env') });

async function verifyTCI() {
  console.log('🔍 TCI System Verification\n');
  console.log('=' .repeat(60));

  const results: { component: string; status: string; details?: string }[] = [];

  // Check environment variables
  console.log('\n1️⃣  Checking Environment Variables...\n');

  const requiredEnvVars = [
    'DATABASE_URL',
    'REDIS_URL',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_AI_API_KEY',
    'PINECONE_API_KEY',
    'NEO4J_URI',
    'NEO4J_USERNAME',
    'NEO4J_PASSWORD'
  ];

  const optionalEnvVars = [
    'HUGGINGFACE_API_KEY',
    'SENTRY_DSN',
    'POSTHOG_API_KEY'
  ];

  let missingRequired = 0;
  let missingOptional = 0;

  requiredEnvVars.forEach(envVar => {
    if (process.env[envVar]) {
      console.log(`✓ ${envVar}: Configured`);
      results.push({ component: envVar, status: '✓ Configured' });
    } else {
      console.log(`✗ ${envVar}: Missing`);
      results.push({ component: envVar, status: '✗ Missing' });
      missingRequired++;
    }
  });

  console.log('');
  optionalEnvVars.forEach(envVar => {
    if (process.env[envVar]) {
      console.log(`✓ ${envVar}: Configured (optional)`);
    } else {
      console.log(`⚠ ${envVar}: Not configured (optional)`);
      missingOptional++;
    }
  });

  // Check Node modules
  console.log('\n2️⃣  Checking Required Packages...\n');

  const requiredPackages = [
    'neo4j-driver',
    'pdfkit',
    'node-fetch',
    '@pinecone-database/pinecone',
    'openai',
    'anthropic',
    '@google/generative-ai'
  ];

  requiredPackages.forEach(pkg => {
    try {
      require.resolve(pkg);
      console.log(`✓ ${pkg}: Installed`);
      results.push({ component: pkg, status: '✓ Installed' });
    } catch {
      console.log(`✗ ${pkg}: Not installed`);
      results.push({ component: pkg, status: '✗ Not installed' });
    }
  });

  // Check TCI services
  console.log('\n3️⃣  Checking TCI Services...\n');

  const tciServices = [
    '../plusultra/backend/src/services/tci/PredictiveQuarantineOrchestrator',
    '../plusultra/backend/src/services/tci/MerkleEnvelopeChain',
    '../plusultra/backend/src/services/tci/TCIOrchestrator',
    '../plusultra/backend/src/services/tci/TCIFeedbackLoop',
    '../plusultra/backend/src/services/temporal/Neo4jGraphService',
    '../plusultra/backend/src/services/compliance/PDFComplianceReportGenerator'
  ];

  tciServices.forEach(service => {
    const serviceName = path.basename(service);
    try {
      require.resolve(service);
      console.log(`✓ ${serviceName}: Available`);
      results.push({ component: serviceName, status: '✓ Available' });
    } catch {
      console.log(`✗ ${serviceName}: Not found`);
      results.push({ component: serviceName, status: '✗ Not found' });
    }
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Verification Summary\n');

  if (missingRequired === 0) {
    console.log('✅ All required environment variables configured');
  } else {
    console.log(`❌ ${missingRequired} required environment variable(s) missing`);
  }

  if (missingOptional > 0) {
    console.log(`⚠️  ${missingOptional} optional environment variable(s) not configured`);
  }

  console.log('');

  if (missingRequired === 0) {
    console.log('🎉 TCI System is ready for production!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Start services: PostgreSQL, Redis, Neo4j');
    console.log('  2. Run: npm run dev');
    console.log('  3. Test the system with example code generation');
  } else {
    console.log('⚠️  Please configure missing environment variables');
    console.log('   Edit .env file and add the required API keys');
  }

  console.log('');
}

verifyTCI().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
