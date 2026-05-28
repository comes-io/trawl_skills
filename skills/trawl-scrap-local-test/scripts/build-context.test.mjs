#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from './build-context.mjs';

// Cookie reader is injected so the builder is pure (no disk in tests).
const fakeRead = () => JSON.stringify([{ name: 'sid', value: 'abc' }]);

test('exposes credentials under TRAWL.account.* (forward namespace, #786)', () => {
  const { TRAWL } = buildContext({ 'account-username': 'alice', 'account-password': 'secret' }, fakeRead);
  assert.equal(TRAWL.account.username, 'alice');
  assert.equal(TRAWL.account.password, 'secret');
});

test('keeps the bare account global as a working alias', () => {
  const { account } = buildContext({ 'account-username': 'alice', 'account-password': 'secret' }, fakeRead);
  assert.equal(account.username, 'alice');
  assert.equal(account.password, 'secret');
});

test('TRAWL.account is null when no credentials/cookies are provided (mirrors buildTrawlAccount)', () => {
  const { TRAWL, account } = buildContext({ url: 'https://example.com' }, fakeRead);
  assert.equal(TRAWL.account, null);
  assert.equal(account.username, null);
});

test('cookies land under TRAWL.account.session.cookies and account.session.cookies', () => {
  const { TRAWL, account } = buildContext({ 'account-cookies': '/tmp/c.json' }, fakeRead);
  assert.deepEqual(TRAWL.account.session.cookies, [{ name: 'sid', value: 'abc' }]);
  assert.deepEqual(account.session.cookies, [{ name: 'sid', value: 'abc' }]);
});

test('TRAWL.url and TRAWL.<custom> params are unchanged', () => {
  const { TRAWL } = buildContext({ url: 'https://x.test', params: 'slug=foo,page=2' }, fakeRead);
  assert.equal(TRAWL.url, 'https://x.test');
  assert.equal(TRAWL.slug, 'foo');
  assert.equal(TRAWL.page, '2');
});
