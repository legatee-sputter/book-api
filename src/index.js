/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request) {
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
  
	  // 1) openBD（書影＋書誌・無制限・ライセンス明快）→ 参照URLは版元ドットコム
	  try {
		const ob = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`).then(r => r.json());
		const s = ob?.[0]?.summary;
		if (s && s.title) {
		  const cover = s.cover || null;
		  return json({
			isbn, title: s.title,
			author: s.author || null,
			publisher: s.publisher || null,
			pubdate: s.pubdate || null,
			cover,                  // 書影URL（openBD・安定）
			thumbnail: cover,       // 別名（coverと同じ値）
			infoLink: `https://www.hanmoto.com/bd/isbn/${isbn}`,  // ISBNから構築・枠消費ゼロ
			source: 'openBD',
		  });
		}
	  } catch (_) {}
  
	  // 2) Google Books フォールバック（openBDに無い本のみ）→ thumbnail と infoLink を返す
	  try {
		const gb = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&country=JP`).then(r => r.json());
		const v = gb?.items?.[0]?.volumeInfo;
		if (v) {
		  const thumb = fixUrl(v.imageLinks?.thumbnail);
		  return json({
			isbn, title: v.title || null,
			author: (v.authors || []).join(', ') || null,
			publisher: v.publisher || null,
			pubdate: v.publishedDate || null,
			cover: thumb,
			thumbnail: thumb,                         // 要望のthumbnail
			infoLink: fixUrl(v.infoLink),             // 要望のinfoLink（Google詳細ページ）
			source: 'GoogleBooks',
		  });
		}
	  } catch (_) {}
  
	  return json({ isbn, title: null, source: 'none' }, 404);
	},
  };
  
  function fixUrl(u) {
	return u ? u.replace('http://', 'https://').replace('&edge=curl', '') : null;
  }