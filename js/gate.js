// Phone-only gate: desktops/laptops get a "made for your phone" landing page with a local QR code.
// Override for testing / promo recording: ?desktop=1
(function () {
  var q = new URLSearchParams(location.search), ua = navigator.userAgent || '';
  var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  var touchUA = /Android|iPhone|iPad|iPod|Mobi|Silk|Kindle/i.test(ua);
  var iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPadOS reports as Mac
  var mobile = coarse || touchUA || iPadOS;
  window.IS_DESK = !mobile && !q.has('desktop') && !q.has('demo');
  if (window.IS_DESK) document.documentElement.classList.add('desk');
})();
function buildDeskLanding() {
  var URL_ = 'https://leafactivity.com/interstellar/';
  var el = document.getElementById('desk'); if (!el) return;
  var qr = qrcode(0, 'M'); qr.addData(URL_); qr.make();
  el.querySelector('.qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  el.hidden = false;
}
