'use strict';

(function () {
  const statusEl = document.getElementById('api-status');
  const labelEl = document.getElementById('status-label');
  const detailEl = document.getElementById('status-detail');

  if (!statusEl || !labelEl || !detailEl) {
    return;
  }

  // Tetapkan keadaan status pada UI.
  function setStatus(state, label, detail) {
    statusEl.classList.remove('status--loading', 'status--ok', 'status--error');
    statusEl.classList.add('status--' + state);
    labelEl.textContent = label;
    detailEl.textContent = detail || '';
  }

  async function checkHealth() {
    try {
      const res = await fetch('/api/health', {
        headers: { Accept: 'application/json' }
      });

      if (!res.ok) {
        setStatus('error', 'API memberi respons ' + res.status, 'Cuba muat semula halaman.');
        return;
      }

      const data = await res.json();

      if (data && data.ok === true) {
        setStatus('ok', 'API aktif', 'service: ' + (data.service || '—'));
      } else {
        setStatus('error', 'API melaporkan masalah', 'Periksa log pelayan.');
      }
    } catch (err) {
      setStatus('error', 'API tidak dapat dihubungi', 'Pastikan pelayan sedang berjalan.');
    }
  }

  checkHealth();
})();
