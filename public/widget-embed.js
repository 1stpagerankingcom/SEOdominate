/* SEODominate Free GMB Audit Widget — embed script
   Usage:
   <script src="https://seodominate.vercel.app/widget-embed.js"
     data-primary="#6c5ce7" data-title="Free GMB Audit"
     data-subtitle="Score your Google Business Profile in 60 seconds"
     data-brand="Acme SEO" data-mode="live" data-email="1"></script>
*/
(function () {
  var s = document.currentScript;
  if (!s) return;
  var attrs = {};
  ['primary', 'title', 'subtitle', 'brand', 'mode', 'email', 'business', 'location'].forEach(function (k) {
    attrs[k] = s.getAttribute('data-' + k) || '';
  });

  var host = s.getAttribute('data-host') || 'https://seodominate.vercel.app';

  var wrap = document.createElement('div');
  wrap.id = 'seodominate-widget';
  wrap.style.cssText = 'max-width:100%;min-height:200px;';
  s.parentNode.insertBefore(wrap, s.nextSibling);

  var params = new URLSearchParams();
  if (attrs.primary) params.set('primary', attrs.primary);
  if (attrs.title) params.set('title', attrs.title);
  if (attrs.subtitle) params.set('subtitle', attrs.subtitle);
  if (attrs.brand) params.set('brand', attrs.brand);
  if (attrs.mode) params.set('mode', attrs.mode);
  if (attrs.email === '0') params.set('email', '0');
  if (attrs.business) params.set('business', attrs.business);
  if (attrs.location) params.set('location', attrs.location);

  var iframe = document.createElement('iframe');
  iframe.src = host + '/widget.html' + (params.toString() ? '?' + params.toString() : '');
  iframe.title = 'Free GMB Audit Widget';
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('loading', 'lazy');
  iframe.style.cssText = 'width:100%;height:420px;border:0;overflow:hidden;display:block;';

  var done = false;
  window.addEventListener('message', function (e) {
    if (e.data && e.data.seodominateWidget === 'resize' && e.data.height) {
      var h = Math.min(Math.max(200, e.data.height), 900);
      iframe.style.height = h + 'px';
      if (done && Math.abs(h - 420) < 2) { /* keep min */ }
    }
  });
  iframe.addEventListener('load', function () { done = true; });

  wrap.appendChild(iframe);
})();
