export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const {
    measurement_id,
    api_secret,
    domain = 'https://example.com',
    path = '/',
    utm_source = 'google',
    utm_medium = 'organic',
    utm_campaign = 'sparktraffic_campaign',
    fire_click = false
  } = req.body || {};

  // Strict Validation: prevent 400 spam errors
  if (!measurement_id || !measurement_id.trim().startsWith('G-')) {
    return res.status(400).json({
      error: 'Invalid Measurement ID. Must start with G- (e.g. G-ABC123XYZ)'
    });
  }

  if (!api_secret || !api_secret.trim()) {
    return res.status(400).json({
      error: 'API Secret is required. Generate this in GA4 Admin -> Data Streams -> Measurement Protocol API Secrets.'
    });
  }

  const cleanDomain = domain.startsWith('http') ? domain : 'https://' + domain;
  const targetUrl = new URL(path, cleanDomain).href;
  const timestampSec = Math.floor(Date.now() / 1000);
  const clientId = `${Math.floor(100000000 + Math.random() * 900000000)}.${timestampSec}`;

  const events = [
    {
      name: 'page_view',
      params: {
        page_title: `Visit - ${path}`,
        page_location: `${targetUrl}?utm_source=${utm_source}&utm_medium=${utm_medium}&utm_campaign=${utm_campaign}`,
        page_referrer: utm_source === 'google' ? 'https://www.google.com/' : 'https://sparktraffic.com/',
        ga_session_id: timestampSec,
        engagement_time_msec: Math.floor(15000 + Math.random() * 20000),
        source: utm_source,
        medium: utm_medium,
        campaign: utm_campaign
      }
    }
  ];

  if (fire_click === true || fire_click === 'true') {
    events.push({
      name: 'click',
      params: {
        link_url: `${targetUrl}#action`,
        link_text: 'Simulated CTA Interaction',
        ga_session_id: timestampSec,
        engagement_time_msec: 4500
      }
    });
  }

  const payload = {
    client_id: clientId,
    events: events
  };

  const gaEndpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurement_id.trim())}&api_secret=${encodeURIComponent(api_secret.trim())}`;

  try {
    const gaResponse = await fetch(gaEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // GA4 returns 204 No Content when accepted
    const isSuccess = gaResponse.status === 204 || gaResponse.status === 200;

    return res.status(200).json({
      success: isSuccess,
      status_code: gaResponse.status,
      timestamp: new Date().toLocaleTimeString(),
      target_url: targetUrl,
      client_id: clientId,
      channel: `${utm_source} / ${utm_medium}`,
      click_fired: Boolean(fire_click),
      ga_status: isSuccess ? 'Delivered to GA4 Realtime (HTTP 204)' : `GA4 HTTP ${gaResponse.status}`,
      dispatched_events: events.map(e => e.name)
    });
  } catch (err) {
    return res.status(502).json({
      error: `Failed to transmit to Google Analytics servers: ${err.message}`
    });
  }
}
