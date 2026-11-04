export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let domain = req.query.domain || (req.body && req.body.domain);
  if (!domain) {
    return res.status(400).json({ error: 'Domain parameter is required' });
  }

  if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
    domain = 'https://' + domain;
  }

  try {
    const targetUrl = new URL(domain);
    const rootOrigin = targetUrl.origin;

    const response = await fetch(targetUrl.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      return res.status(200).json({
        success: false,
        domain: rootOrigin,
        message: `HTTP ${response.status}: Target site unreachable. Using root URL.`,
        urls: [{ id: 1, path: '/', weight: 100, enabled: true }]
      });
    }

    const html = await response.text();
    const hrefRegex = /href=["']([^"'#\s>]+)["']/gi;
    const discoveredPaths = new Set();
    discoveredPaths.add('/');

    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      let rawHref = match[1].trim();

      if (
        rawHref.startsWith('javascript:') ||
        rawHref.startsWith('mailto:') ||
        rawHref.startsWith('tel:') ||
        rawHref.match(/\.(png|jpg|jpeg|gif|svg|css|js|woff|woff2|ico|pdf|zip|mp4)$/i)
      ) {
        continue;
      }

      try {
        let resolved = new URL(rawHref, rootOrigin);
        if (resolved.origin === rootOrigin) {
          let cleanPath = resolved.pathname;
          if (cleanPath.length > 1 && cleanPath.endsWith('/')) {
            cleanPath = cleanPath.slice(0, -1);
          }
          if (cleanPath && !discoveredPaths.has(cleanPath)) {
            discoveredPaths.add(cleanPath);
          }
        }
      } catch (e) {}

      if (discoveredPaths.size >= 10) break;
    }

    const pathList = Array.from(discoveredPaths);
    const splitWeight = Math.floor(100 / pathList.length);
    const remainder = 100 - (splitWeight * pathList.length);

    const formattedUrls = pathList.map((path, idx) => ({
      id: idx + 1,
      path: path,
      weight: splitWeight + (idx === 0 ? remainder : 0),
      enabled: true
    }));

    return res.status(200).json({
      success: true,
      domain: rootOrigin,
      count: formattedUrls.length,
      urls: formattedUrls
    });
  } catch (error) {
    return res.status(200).json({
      success: false,
      domain: domain,
      message: error.message || 'Crawl failed, default root provided',
      urls: [{ id: 1, path: '/', weight: 100, enabled: true }]
    });
  }
}
