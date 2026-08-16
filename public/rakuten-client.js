const RAKUTEN_ENDPOINT = 'https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404';
const COMIC_GENRE_ID = '001001';

export async function searchByTitle(keyword, appId, { hits = 10 } = {}) {
  const params = new URLSearchParams({
    applicationId: appId,
    title: keyword,
    booksGenreId: COMIC_GENRE_ID,
    sort: '-releaseDate',
    hits: String(hits),
    format: 'json',
  });
  const res = await fetch(`${RAKUTEN_ENDPOINT}?${params.toString()}`);
  const data = await res.json();
  if (data.error) {
    throw new Error(`楽天API エラー: ${data.error_description || data.error}`);
  }
  return (data.Items || []).map((wrap) => {
    const item = wrap.Item;
    return {
      title: item.title,
      itemUrl: item.itemUrl,
      imageUrl: item.mediumImageUrl || item.smallImageUrl || null,
      releaseDate: item.salesDate || null,
      isbn: item.isbn || null,
    };
  });
}
