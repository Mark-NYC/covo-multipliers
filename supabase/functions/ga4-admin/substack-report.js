// Keep publication web traffic separate from CoVo when sharing a GA4 property.
export function substackReport(action, dateRange) {
  const hostname = { filter: { fieldName: 'hostName', stringFilter: {
    matchType: 'EXACT', value: 'multiplyingdisciples.substack.com', caseSensitive: false,
  } } };
  if (action === 'substack_traffic') return {
    dateRanges: [dateRange], dimensions: [{ name: 'hostName' }, { name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'sessions' }, { name: 'engagementRate' }],
    dimensionFilter: hostname,
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 200,
  };
  if (action === 'substack_events') return {
    dateRanges: [dateRange], dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }], dimensionFilter: hostname,
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 100,
  };
  throw new Error('Unsupported Substack GA4 report');
}
