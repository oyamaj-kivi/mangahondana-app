import * as store from './store.js';

const state = { series: [], newReleases: [], openIds: new Set() };

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2200);
}

async function loadAll() {
  const [series, newReleases, status] = await Promise.all([
    store.listSeriesWithDetails(),
    store.listActiveNewReleases(),
    store.getStatus(),
  ]);
  state.series = series;
  state.newReleases = newReleases;
  render(status);
}

function render(status) {
  renderStatus(status);
  renderNewReleases();
  renderSeriesList();
}

function renderStatus(status) {
  const el = document.getElementById('status-line');
  if (!status) return;
  const parts = [];
  if (!status.rakutenConfigured) {
    parts.push('新刊チェック機能は未設定です（右上の設定から楽天APIキーを入力）');
  } else if (status.lastCheck) {
    parts.push(`最終チェック: ${new Date(status.lastCheck).toLocaleString('ja-JP')}`);
  } else {
    parts.push('まだ新刊チェックを実行していません');
  }
  parts.push('データはこの端末内に保存されています');
  el.textContent = parts.join(' ・ ');
}

function renderNewReleases() {
  const badge = document.getElementById('new-release-badge');
  const panel = document.getElementById('new-release-panel');
  const items = document.getElementById('new-release-items');

  if (state.newReleases.length === 0) {
    badge.textContent = '';
    panel.style.display = 'none';
    return;
  }

  badge.innerHTML = `<span class="badge">${state.newReleases.length}</span>`;
  panel.style.display = 'block';
  items.innerHTML = state.newReleases
    .map(
      (nr) => `
      <div class="new-release-item">
        ${nr.image_url ? `<img src="${escapeAttr(nr.image_url)}" alt="" />` : ''}
        <div class="info">
          <a href="${escapeAttr(nr.item_url || '#')}" target="_blank" rel="noopener">${escapeHtml(nr.series_title)} ${nr.volume_number != null ? nr.volume_number + '巻' : ''}</a>
          <div class="meta">${escapeHtml(nr.title)}${nr.release_date ? ' ・ ' + escapeHtml(nr.release_date) : ''}</div>
        </div>
        <button class="ghost" data-dismiss="${nr.id}">確認済</button>
      </div>`
    )
    .join('');

  items.querySelectorAll('[data-dismiss]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await store.dismissNewRelease(Number(btn.dataset.dismiss));
      await loadAll();
    });
  });
}

function renderSeriesList() {
  const list = document.getElementById('series-list');
  if (state.series.length === 0) {
    list.innerHTML = '<div class="empty">まだ作品が登録されていません。右上の「+ 作品を追加」から始めましょう。</div>';
    return;
  }

  list.innerHTML = state.series.map(seriesCardHtml).join('');

  state.series.forEach((s) => {
    const card = document.getElementById(`card-${s.id}`);
    card.querySelector('.head').addEventListener('click', () => {
      if (state.openIds.has(s.id)) state.openIds.delete(s.id);
      else state.openIds.add(s.id);
      card.classList.toggle('open');
    });

    card.querySelector('[data-action="add-volumes"]').addEventListener('click', async () => {
      const input = card.querySelector('[data-role="volume-input"]');
      if (!input.value.trim()) return;
      try {
        await store.addVolumes(s.id, input.value.trim());
        input.value = '';
        showToast('巻を追加しました');
        state.openIds.add(s.id);
        await loadAll();
      } catch (e) {
        showToast('追加に失敗しました: ' + e.message);
      }
    });

    card.querySelectorAll('[data-remove-volume]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await store.removeVolume(s.id, btn.dataset.removeVolume);
        state.openIds.add(s.id);
        await loadAll();
      });
    });

    card.querySelector('[data-action="delete-series"]').addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!confirm(`「${s.title}」を削除しますか？(所持巻情報もすべて削除されます)`)) return;
      await store.deleteSeries(s.id);
      showToast('削除しました');
      await loadAll();
    });
  });
}

function seriesCardHtml(s) {
  const isOpen = state.openIds.has(s.id);
  const missingCount = s.missingVolumes.length;
  const newCount = s.newReleases.length;

  const ownedChips = s.ownedVolumes
    .map((v) => `<span class="chip owned">${v}巻<button data-remove-volume="${v}" title="削除">×</button></span>`)
    .join('');
  const missingChips = s.missingVolumes.map((v) => `<span class="chip missing">${v}巻</span>`).join('');

  return `
  <div id="card-${s.id}" class="series-card ${isOpen ? 'open' : ''}">
    <div class="head">
      <div class="titles">
        <h3>${escapeHtml(s.title)}</h3>
        ${s.author ? `<div class="author">${escapeHtml(s.author)}</div>` : ''}
      </div>
      <div class="summary-badges">
        ${missingCount ? `<span class="pill missing">抜け${missingCount}冊</span>` : ''}
        ${newCount ? `<span class="pill newrelease">新刊${newCount}</span>` : ''}
      </div>
      <span class="chevron">▶</span>
    </div>
    <div class="body">
      <div class="section-title">持っている巻 (${s.ownedVolumes.length}冊)</div>
      <div class="volume-chips">${ownedChips || '<span class="pill">まだ登録なし</span>'}</div>

      ${missingCount ? `<div class="section-title">抜けている巻</div><div class="volume-chips">${missingChips}</div>` : ''}

      <div class="row">
        <input data-role="volume-input" placeholder="巻を追加: 例 15 や 16-18" />
        <button data-action="add-volumes">追加</button>
      </div>

      <div class="card-footer">
        <button class="danger" data-action="delete-series">この作品を削除</button>
      </div>
    </div>
  </div>`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}

// --- add form ---
const addPanel = document.getElementById('add-form-panel');
document.getElementById('add-toggle-btn').addEventListener('click', () => {
  addPanel.classList.toggle('open');
});
document.getElementById('add-cancel-btn').addEventListener('click', () => {
  addPanel.classList.remove('open');
});
document.getElementById('add-submit-btn').addEventListener('click', async () => {
  const title = document.getElementById('f-title').value.trim();
  if (!title) { showToast('作品名を入力してください'); return; }
  const author = document.getElementById('f-author').value.trim();
  const keyword = document.getElementById('f-keyword').value.trim();
  const volumesRaw = document.getElementById('f-volumes').value.trim();
  const status = document.getElementById('f-status').value;

  try {
    await store.createSeries({
      title,
      author: author || null,
      search_keyword: keyword || title,
      status,
      volumes: volumesRaw || undefined,
    });
    ['f-title', 'f-author', 'f-keyword', 'f-volumes'].forEach((id) => (document.getElementById(id).value = ''));
    addPanel.classList.remove('open');
    showToast('作品を追加しました');
    await loadAll();
  } catch (e) {
    showToast('追加に失敗しました: ' + e.message);
  }
});

document.getElementById('check-btn').addEventListener('click', async () => {
  const btn = document.getElementById('check-btn');
  btn.disabled = true;
  btn.textContent = 'チェック中...';
  try {
    const result = await store.checkAllSeries();
    if (!result.ok) {
      showToast('楽天APIキーが未設定です。設定から入力してください');
    } else {
      showToast('新刊チェックが完了しました');
    }
    await loadAll();
  } catch (e) {
    showToast('チェックに失敗しました: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '新刊チェック';
  }
});

// --- settings ---
const settingsPanel = document.getElementById('settings-panel');
document.getElementById('settings-toggle-btn').addEventListener('click', async () => {
  const current = (await store.getSetting('rakuten_app_id')) || '';
  document.getElementById('f-rakuten-app-id').value = current;
  settingsPanel.classList.toggle('open');
});
document.getElementById('settings-cancel-btn').addEventListener('click', () => {
  settingsPanel.classList.remove('open');
});
document.getElementById('settings-save-btn').addEventListener('click', async () => {
  const value = document.getElementById('f-rakuten-app-id').value.trim();
  await store.setSetting('rakuten_app_id', value || null);
  settingsPanel.classList.remove('open');
  showToast('設定を保存しました');
  await loadAll();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

loadAll().catch((e) => showToast('読み込みに失敗しました: ' + e.message));
