import assert from 'node:assert/strict';
import test from 'node:test';
import {
  containsCredentialMaterial,
  normalizeHttpsUrl,
  parseChecklistSteps,
} from '../artifacts/middlemain/utils/humanHands';

test('Human Hands blocks obvious credential assignments before storage or AI requests', () => {
  for (const input of [
    'password: example-secret',
    'my API key is sk-example',
    'verification code=123456',
    'Bearer abc123',
    'recovery code is abc-def',
    'token: abc123',
    '-----BEGIN PRIVATE KEY-----',
  ]) {
    assert.equal(containsCredentialMaterial(input), true, input);
  }
  assert.equal(containsCredentialMaterial('Create an Apple Developer account'), false);
});

test('Human Hands only opens HTTPS websites without embedded login credentials', () => {
  assert.equal(normalizeHttpsUrl('developer.apple.com'), 'https://developer.apple.com/');
  assert.equal(normalizeHttpsUrl('http://example.com'), null);
  assert.equal(normalizeHttpsUrl('javascript:alert(1)'), null);
  assert.equal(normalizeHttpsUrl('https://person:password@example.com'), null);
  assert.equal(normalizeHttpsUrl(''), '');
});

test('Human Hands turns a numbered response into a bounded checklist', () => {
  assert.deepEqual(parseChecklistSteps('Set up\n1. Open the official site\n2) Sign in yourself\n- Review the permissions'), [
    { text: 'Open the official site', done: false },
    { text: 'Sign in yourself', done: false },
    { text: 'Review the permissions', done: false },
  ]);
  assert.deepEqual(parseChecklistSteps('Check the official page before continuing.'), [
    { text: 'Check the official page before continuing.', done: false },
  ]);
});
