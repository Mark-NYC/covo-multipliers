import test from 'node:test';
import assert from 'node:assert/strict';
import { substackReport } from './substack-report.js';
test('both reports isolate the publication hostname in a shared property', () => {
  for (const action of ['substack_traffic', 'substack_events']) {
    const report = substackReport(action, { startDate: '2026-10-01', endDate: '2026-10-01' });
    assert.equal(report.dimensionFilter.filter.fieldName, 'hostName');
    assert.equal(report.dimensionFilter.filter.stringFilter.value, 'multiplyingdisciples.substack.com');
    assert.equal(report.dimensionFilter.filter.stringFilter.matchType, 'EXACT');
  }
});
test('unsupported reports do not silently return unrelated analytics', () => {
  assert.throws(() => substackReport('overview', {}));
});
