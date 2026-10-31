// The contribution-graph function (functions/api/github.js), on a trimmed copy of GitHub's markup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContributions } from '../functions/api/github.js';

const HTML = `
<h2 class="f4 text-normal mb-2">
      2,039
      contributions
        in the last year
</h2>
<td tabindex="0" data-ix="0" aria-selected="false" style="width: 10px" data-date="2025-10-27" id="contribution-day-component-1-0" data-level="2" role="gridcell" class="ContributionCalendar-day"></td>
<td tabindex="0" data-ix="0" aria-selected="false" style="width: 10px" data-date="2025-10-26" id="contribution-day-component-0-0" data-level="0" role="gridcell" class="ContributionCalendar-day"></td>
<tool-tip id="tooltip-1" for="contribution-day-component-0-0" popover="manual" data-direction="n" data-type="label" data-view-component="true" class="sr-only position-absolute">No contributions on October 26th.</tool-tip>
<tool-tip id="tooltip-2" for="contribution-day-component-1-0" popover="manual" data-direction="n" data-type="label" data-view-component="true" class="sr-only position-absolute">12 contributions on October 27th.</tool-tip>`;

test('reads the total, every day in date order, and each day\'s count', () => {
  const r = parseContributions(HTML);
  assert.equal(r.total, 2039);
  assert.deepEqual(r.days, [{ date: '2025-10-26', level: 0, count: 0 }, { date: '2025-10-27', level: 2, count: 12 }]);
});

test('copes with a page that has no graph', () => {
  assert.deepEqual(parseContributions('<html></html>'), { total: null, days: [] });
});
