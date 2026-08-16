import { tx, all, allByIndex, get, put, add, del } from './idb.js';
import { computeMissingVolumes, extractVolumeNumber, parseVolumeInput } from './logic.js';
import { searchByTitle } from './rakuten-client.js';

function volumeKey(seriesId, volumeNumber) {
  return `${seriesId}:${volumeNumber}`;
}

async function attachDetails(seriesRow) {
  const volumeRows = await tx('volumes', 'readonly', (store) => allByIndex(store, 'series_id', seriesRow.id));
  const owned = volumeRows.map((r) => r.volume_number).sort((a, b) => a - b);
  const newReleaseRows = await tx('new_releases', 'readonly', (store) => allByIndex(store, 'series_id', seriesRow.id));
  const newReleases = newReleaseRows.filter((r) => !r.dismissed).sort((a, b) => (a.volume_number ?? 0) - (b.volume_number ?? 0));
  return {
    ...seriesRow,
    ownedVolumes: owned,
    missingVolumes: computeMissingVolumes(owned),
    latestOwned: owned.length ? Math.max(...owned) : null,
    newReleases,
  };
}

export async function listSeriesWithDetails() {
  const rows = await tx('series', 'readonly', (store) => all(store));
  rows.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
  return Promise.all(rows.map(attachDetails));
}

export async function createSeries({ title, author, search_keyword, status, volumes }) {
  if (!title || !title.trim()) throw new Error('title_required');
  const record = {
    title: title.trim(),
    author: author || null,
    search_keyword: (search_keyword || title).trim(),
    status: status || 'ongoing',
    created_at: new Date().toISOString(),
  };
  const id = await tx('series', 'readwrite', (store) => add(store, record));

  const numbers = parseVolumeInput(volumes);
  if (numbers.length) {
    await tx('volumes', 'readwrite', async (store) => {
      for (const n of numbers) {
        await put(store, { key: volumeKey(id, n), series_id: id, volume_number: n });
      }
    });
  }
  return attachDetails({ ...record, id });
}

export async function deleteSeries(id) {
  const seriesId = Number(id);
  await tx('series', 'readwrite', (store) => del(store, seriesId));
  await tx('volumes', 'readwrite', async (store) => {
    const rows = await allByIndex(store, 'series_id', seriesId);
    for (const r of rows) await del(store, r.key);
  });
  await tx('new_releases', 'readwrite', async (store) => {
    const rows = await allByIndex(store, 'series_id', seriesId);
    for (const r of rows) await del(store, r.id);
  });
}

export async function addVolumes(seriesId, volumesInput) {
  const id = Number(seriesId);
  const numbers = parseVolumeInput(volumesInput);
  if (!numbers.length) throw new Error('invalid_volumes');
  await tx('volumes', 'readwrite', async (store) => {
    for (const n of numbers) {
      await put(store, { key: volumeKey(id, n), series_id: id, volume_number: n });
    }
  });
  const series = await tx('series', 'readonly', (store) => get(store, id));
  return attachDetails(series);
}

export async function removeVolume(seriesId, volumeNumber) {
  const id = Number(seriesId);
  await tx('volumes', 'readwrite', (store) => del(store, volumeKey(id, Number(volumeNumber))));
  const series = await tx('series', 'readonly', (store) => get(store, id));
  return attachDetails(series);
}

export async function listActiveNewReleases() {
  const rows = await tx('new_releases', 'readonly', (store) => all(store));
  const seriesRows = await tx('series', 'readonly', (store) => all(store));
  const seriesById = Object.fromEntries(seriesRows.map((s) => [s.id, s]));
  return rows
    .filter((r) => !r.dismissed)
    .map((r) => ({ ...r, series_title: seriesById[r.series_id]?.title || '' }))
    .sort((a, b) => new Date(b.found_at) - new Date(a.found_at));
}

export async function dismissNewRelease(id) {
  await tx('new_releases', 'readwrite', async (store) => {
    const row = await get(store, Number(id));
    if (row) {
      row.dismissed = 1;
      await put(store, row);
    }
  });
}

// --- settings ---

export async function getSetting(key) {
  const row = await tx('settings', 'readonly', (store) => get(store, key));
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  await tx('settings', 'readwrite', (store) => put(store, { key, value }));
}

export async function getStatus() {
  const appId = await getSetting('rakuten_app_id');
  const lastCheck = await getSetting('last_check');
  return { rakutenConfigured: Boolean(appId), lastCheck };
}

// --- new release checking ---

export async function checkAllSeries() {
  const appId = await getSetting('rakuten_app_id');
  if (!appId) return { ok: false, reason: 'not_configured' };

  const seriesRows = await tx('series', 'readonly', (store) => all(store));
  const targets = seriesRows.filter((s) => s.search_keyword && s.status !== 'completed');

  const results = [];
  for (const series of targets) {
    try {
      results.push(await checkSeries(series, appId));
    } catch (err) {
      results.push({ seriesId: series.id, error: err.message });
    }
  }
  await setSetting('last_check', new Date().toISOString());
  return { ok: true, results };
}

async function checkSeries(series, appId) {
  const volumeRows = await tx('volumes', 'readonly', (store) => allByIndex(store, 'series_id', series.id));
  const maxOwned = volumeRows.length ? Math.max(...volumeRows.map((r) => r.volume_number)) : 0;

  const items = await searchByTitle(series.search_keyword, appId, { hits: 10 });
  const existing = await tx('new_releases', 'readonly', (store) => allByIndex(store, 'series_id', series.id));
  const existingTitles = new Set(existing.map((r) => r.title));

  let found = 0;
  for (const item of items) {
    const vol = extractVolumeNumber(item.title);
    if (vol === null || vol <= maxOwned) continue;
    if (existingTitles.has(item.title)) continue;
    await tx('new_releases', 'readwrite', (store) =>
      add(store, {
        series_id: series.id,
        volume_number: vol,
        title: item.title,
        release_date: item.releaseDate,
        item_url: item.itemUrl,
        image_url: item.imageUrl,
        found_at: new Date().toISOString(),
        dismissed: 0,
      })
    );
    existingTitles.add(item.title);
    found++;
  }
  return { seriesId: series.id, found };
}
