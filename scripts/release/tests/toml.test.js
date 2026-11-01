import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify } from '../lib/toml.js';

describe('TOML parser', () => {
  it('parses string values', () => {
    const result = parse('name = "hello"');
    assert.equal(result.name, 'hello');
  });

  it('parses boolean values', () => {
    const result = parse('enabled = true\ndisabled = false');
    assert.equal(result.enabled, true);
    assert.equal(result.disabled, false);
  });

  it('parses integer values', () => {
    const result = parse('count = 42');
    assert.equal(result.count, 42);
  });

  it('parses string arrays', () => {
    const result = parse('paths = ["a", "b", "c"]');
    assert.deepEqual(result.paths, ['a', 'b', 'c']);
  });

  it('parses empty arrays', () => {
    const result = parse('items = []');
    assert.deepEqual(result.items, []);
  });

  it('skips comments and blank lines', () => {
    const result = parse('# comment\n\nname = "value"\n# another');
    assert.equal(result.name, 'value');
    assert.equal(Object.keys(result).length, 1);
  });

  it('parses array-of-tables', () => {
    const input = `
[[units]]
basename = "foo"
path = "foo"
docker = true

[[units]]
basename = "bar"
path = "bar"
docker = false
`;
    const result = parse(input);
    assert.equal(result.units.length, 2);
    assert.equal(result.units[0].basename, 'foo');
    assert.equal(result.units[0].docker, true);
    assert.equal(result.units[1].basename, 'bar');
    assert.equal(result.units[1].docker, false);
  });

  it('handles escaped characters in strings', () => {
    const result = parse('val = "a\\"b"');
    assert.equal(result.val, 'a"b');
  });
});

describe('TOML stringify', () => {
  it('stringifies top-level values', () => {
    const result = stringify({ paths: ['a', 'b'] });
    assert.ok(result.includes('paths = ["a", "b"]'));
  });

  it('stringifies array-of-tables', () => {
    const result = stringify({
      units: [
        { basename: 'foo', path: 'foo', metadata: 'package.json', version: '1.0.0', docker: true },
      ],
    });
    assert.ok(result.includes('[[units]]'));
    assert.ok(result.includes('basename = "foo"'));
    assert.ok(result.includes('docker = true'));
  });

  it('includes header comment', () => {
    const result = stringify({ key: 'val' }, { header: 'Generated file' });
    assert.ok(result.startsWith('# Generated file'));
  });

  it('produces deterministic output', () => {
    const obj = {
      units: [
        { basename: 'a', path: 'a', version: '1.0.0', docker: false },
        { basename: 'b', path: 'b', version: '2.0.0', docker: true },
      ],
    };
    const first = stringify(obj);
    const second = stringify(obj);
    assert.equal(first, second);
  });
});

describe('TOML round-trip', () => {
  it('parse(stringify(obj)) preserves data', () => {
    const obj = {
      units: [
        { basename: 'nomos', path: 'nomos', metadata: 'package.json', version: '0.6.0', docker: true },
      ],
    };
    const text = stringify(obj);
    const parsed = parse(text);
    assert.deepEqual(parsed.units, obj.units);
  });
});

describe('multi-line arrays', () => {
  it('accepts comments and trailing commas while preserving literal hashes, commas and brackets', () => {
    const parsed = parse(`include = [ # public inputs
      "src/**", # code
      # independent comment
      "tests/**",
      "a#b,]",
    ] # end
    check = "echo #literal"
    topics = [] # empty
    [[units]]
    paths = [
      { path = "a", basename = "b" },
    ]`);
    assert.deepEqual(parsed, {
      include: ['src/**', 'tests/**', 'a#b,]'], check: 'echo #literal', topics: [], units: [{ paths: [{ path: 'a', basename: 'b' }] }]
    });
  });

  it('splits strings ending in escaped backslashes and strings containing escaped quotes', () => {
    const values = ['a\\', 'b"#],', 'c'];
    assert.deepEqual(parse(stringify({ values })).values, values);
  });

  it('rejects unclosed arrays and basic strings', () => {
    assert.throws(() => parse('include = [\n "src/**",'), /Unterminated TOML array/);
    assert.throws(() => parse('check = "unclosed'), /Unterminated TOML string/);
  });
});
