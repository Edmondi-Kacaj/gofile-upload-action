import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GofileError, HttpClient } from '../src/gofile/http';

describe('GofileError', () => {
  it('stores code and status', () => {
    const err = new GofileError('error-token', 'Invalid token', 401);
    assert.equal(err.code, 'error-token');
    assert.equal(err.statusCode, 401);
    assert.equal(err.message, 'Invalid token');
    assert.equal(err.name, 'GofileError');
  });
});

describe('HttpClient', () => {
  it('constructs without token', () => {
    const http = new HttpClient();
    assert.equal(http.hasToken, false);
  });

  it('accepts and clears token', () => {
    const http = new HttpClient({ token: 'abc' });
    assert.equal(http.hasToken, true);
    http.setToken(undefined);
    assert.equal(http.hasToken, false);
    http.setToken('xyz');
    assert.equal(http.hasToken, true);
  });
});
