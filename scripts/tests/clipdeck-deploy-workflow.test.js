import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';

const workflow = readFileSync('.github/workflows/clipdeck-deploy.yml', 'utf8');
const verificationStep = workflow.slice(workflow.indexOf('- name: Verify unauthenticated API is locked'));

it('does not verify Clipdeck production with the old exact Worker 401 check', () => {
  assert.equal(/^\s*\[\s*"\$\{status\}"\s*=\s*"401"\s*\]\s*$/m.test(verificationStep), false);
});

it('does not use owner or secret credentials in the Clipdeck Access lock check', () => {
  assert.equal(
    /SHARED_SECRET|GITHUB_TOKEN|CF_Authorization|CF-Authorization|Cookie:|one-time PIN|owner credentials/i.test(verificationStep),
    false
  );
});

it('accepts only Cloudflare Access handled unauthenticated responses', () => {
  assert.match(verificationStep, /302/);
  assert.match(verificationStep, /303/);
  assert.match(verificationStep, /401/);
  assert.match(verificationStep, /403/);
  assert.match(verificationStep, /Location/i);
  assert.match(verificationStep, /Access/i);
});

it('rejects item data and the old Worker unauthorized body', () => {
  assert.match(verificationStep, /sections/);
  assert.match(verificationStep, /unauthorized/);
});
