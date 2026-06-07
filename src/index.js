/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const REFERER = 'https://book-api.18cowherd-delight.workers.dev/';  // ★許可サイトと一致させる

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isbn = (url.searchParams.get('isbn') || '').replace(/[-\s]/g, '');
    const json = (o, s = 200) => new Response(JSON.stringify(o), {
      status: s,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=86400',
      },
    });

    if (!/^97[89]\d{10}$/.test(isbn)) return json({ error: 'invalid_isbn', isbn }, 400);

    let base = null, openbdCover = null, googleThumb = null;

    // 書誌: openBD → Google
    try {
      const ob = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`).then(r => r.json());
      const s = ob?.[0]?.summary;
      if (s && s.title) {
        openbdCover = s.cover || null;
        base = { title: s.title, author: s.author || null, publisher: s.publisher || null,
          pubdate: s.pubdate || null, infoLink: `https://www.hanmoto.com/bd/isbn/${isbn}`, source: 'openBD' };
      }
    } catch (_) {}

    if (!base) {
      try {
        const gb = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&country=JP`).then(r => r.json());
        const v = gb?.items?.[0]?.volumeInfo;
        if (v) {
          googleThumb = fixUrl(v.imageLinks?.thumbnail);
          base = { title: v.title || null, author: (v.authors || []).join(', ') || null,
            publisher: v.publisher || null, pubdate: v.publishedDate || null,
            infoLink: fixUrl(v.infoLink), source: 'GoogleBooks' };
        }
      } catch (_) {}
    }

    const cover = await resolveCover(isbn, openbdCover, googleThumb, env);

    if (!base) return json({ isbn, title: null, cover, source: 'none' }, cover ? 200 : 404);
    return json({ isbn, ...base, cover, thumbnail: cover });
  },
};

// 書影: openBD → 楽天(2026新仕様) → NDL → Google
async function resolveCover(isbn, openbdCover, googleThumb, env) {
  if (openbdCover) return openbdCover;

  if (env.RAKUTEN_APP_ID && env.RAKUTEN_ACCESS_KEY) {
    try {
      const rk = `https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404?applicationId=${env.RAKUTEN_APP_ID}&isbn=${isbn}&hits=1&format=json`;
      const r = await fetch(rk, {
        headers: {
          'accessKey': env.RAKUTEN_ACCESS_KEY,
          'Referer': REFERER,
          'Origin': REFERER.replace(/\/$/, ''),
          'User-Agent': 'book-api/1.0',
        },
      }).then(x => x.json());
      const img = r?.Items?.[0]?.Item?.largeImageUrl || r?.Items?.[0]?.Item?.mediumImageUrl;
      if (img) return img.replace('http://', 'https://');
    } catch (_) {}
  }

  try {
    const ndl = `https://ndlsearch.ndl.go.jp/thumbnail/${isbn}.jpg`;
    const head = await fetch(ndl, { method: 'HEAD' });
    if (head.ok && (head.headers.get('content-type') || '').includes('image')) return ndl;
  } catch (_) {}

  if (googleThumb) return googleThumb;
  return null;
}

function fixUrl(u) {
  return u ? u.replace('http://', 'https://').replace('&edge=curl', '') : null;
}