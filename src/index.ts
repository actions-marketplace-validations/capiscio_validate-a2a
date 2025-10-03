import * as core from '@actions/core';
import * as exec from '@actions/exec';

interface ValidationResult {
  success: boolean;
  errors: any[];
  warnings: any[];
  scoringResult?: {
    compliance: { total: number; rating: string };
    trust: { total: number; rating: string };
    availability: { total: number | null; rating: string | null } | null;
    productionReady?: boolean;
  };
}

async function run(): Promise<void> {
  try {
    // Get inputs
    const agentCard = core.getInput('agent-card');
    const strict = core.getBooleanInput('strict');
    const testLive = core.getBooleanInput('test-live');
    const skipSignature = core.getBooleanInput('skip-signature');
    const timeout = core.getInput('timeout');
    const failOnWarnings = core.getBooleanInput('fail-on-warnings');

    core.info(`🚀 Validating A2A agent card: ${agentCard}`);

    // Install capiscio-cli globally
    core.info('📦 Installing capiscio-cli@2.0.0...');
    await exec.exec('npm', ['install', '-g', 'capiscio-cli@2.0.0']);

    // Build command arguments
    const args = ['validate', agentCard, '--json'];
    
    if (strict) args.push('--strict');
    if (testLive) args.push('--test-live');
    if (skipSignature) args.push('--skip-signature');
    if (timeout) args.push('--timeout', timeout);

    // Run validation
    let output = '';
    let errorOutput = '';
    
    const options = {
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
        stderr: (data: Buffer) => {
          errorOutput += data.toString();
        }
      },
      ignoreReturnCode: true
    };

    core.info(`🔍 Running: capiscio ${args.join(' ')}`);
    const exitCode = await exec.exec('capiscio', args, options);

    // Log raw output for debugging
    if (output) {
      core.debug(`CLI Output: ${output}`);
    }
    if (errorOutput) {
      core.debug(`CLI Error Output: ${errorOutput}`);
    }

    // Parse JSON output
    let result: ValidationResult;
    try {
      result = JSON.parse(output);
    } catch (error) {
      // If JSON parsing fails, show the raw output
      core.error('Failed to parse validation output as JSON');
      core.error(`Raw output: ${output}`);
      core.error(`Error output: ${errorOutput}`);
      core.setFailed(`Validation failed with exit code ${exitCode}`);
      return;
    }

    // Set basic outputs
    core.setOutput('result', result.success ? 'passed' : 'failed');
    core.setOutput('error-count', (result.errors?.length || 0).toString());
    core.setOutput('warning-count', (result.warnings?.length || 0).toString());

    // Set scoring outputs (handle undefined gracefully)
    if (result.scoringResult) {
      core.setOutput('compliance-score', result.scoringResult.compliance?.total?.toString() || '0');
      core.setOutput('trust-score', result.scoringResult.trust?.total?.toString() || '0');
      core.setOutput(
        'availability-score',
        result.scoringResult.availability?.total?.toString() || 'not-tested'
      );
      core.setOutput('production-ready', (result.scoringResult.productionReady || false).toString());

      // Display scores
      core.info('');
      core.info('📊 Quality Scores:');
      if (result.scoringResult.compliance) {
        const compScore = result.scoringResult.compliance.total;
        const compRating = result.scoringResult.compliance.rating;
        core.info(`  Compliance: ${compScore}/100 (${compRating})`);
      }
      if (result.scoringResult.trust) {
        const trustScore = result.scoringResult.trust.total;
        const trustRating = result.scoringResult.trust.rating;
        core.info(`  Trust: ${trustScore}/100 (${trustRating})`);
      }
      if (result.scoringResult.availability && result.scoringResult.availability.total !== null) {
        const availScore = result.scoringResult.availability.total;
        const availRating = result.scoringResult.availability.rating;
        core.info(`  Availability: ${availScore}/100 (${availRating})`);
      }
      core.info('');
      core.info(`🎯 Production Ready: ${result.scoringResult.productionReady ? '✅ YES' : '❌ NO'}`);
    } else {
      // No scoring result available
      core.setOutput('compliance-score', 'N/A');
      core.setOutput('trust-score', 'N/A');
      core.setOutput('availability-score', 'N/A');
      core.setOutput('production-ready', 'false');
    }

    // Display errors
    if (result.errors && result.errors.length > 0) {
      core.info('');
      core.error(`❌ Found ${result.errors.length} error(s):`);
      result.errors.forEach((err: any) => {
        core.error(`  - ${err.message || err}`);
      });
    }

    // Display warnings
    if (result.warnings && result.warnings.length > 0) {
      core.info('');
      core.warning(`⚠️  Found ${result.warnings.length} warning(s):`);
      result.warnings.forEach((warn: any) => {
        core.warning(`  - ${warn.message || warn}`);
      });
    }

    // Determine if action should fail
    if (!result.success) {
      const errorCount = result.errors?.length || 0;
      core.setFailed(`Validation failed with ${errorCount} error(s)`);
    } else if (failOnWarnings && result.warnings && result.warnings.length > 0) {
      core.setFailed(`Validation passed but found ${result.warnings.length} warning(s) (fail-on-warnings enabled)`);
    } else {
      core.info('');
      core.info('✅ Validation passed!');
    }

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

run();
