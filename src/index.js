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
  
	  // 1) openBD（書影＋書誌・無登録）
	  try {
		const ob = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`).then(r => r.json());
		const s = ob?.[0]?.summary;
		if (s && s.title) {
		  return json({
			isbn, title: s.title,
			author: s.author || null,
			publisher: s.publisher || null,
			pubdate: s.pubdate || null,
			cover: s.cover || await googleCover(isbn),
			source: 'openBD',
		  });
		}
	  } catch (_) {}
  
	  // 2) Google Books フォールバック
	  try {
		const gb = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&country=JP`).then(r => r.json());
		const v = gb?.items?.[0]?.volumeInfo;
		if (v) {
		  return json({
			isbn, title: v.title || null,
			author: (v.authors || []).join(', ') || null,
			publisher: v.publisher || null,
			pubdate: v.publishedDate || null,
			cover: fixCover(v.imageLinks?.thumbnail),
			source: 'GoogleBooks',
		  });
		}
	  } catch (_) {}
  
	  return json({ isbn, title: null, source: 'none' }, 404);
	},
  };
  
  function fixCover(u) {
	return u ? u.replace('http://', 'https://').replace('&edge=curl', '') : null;
  }
  async function googleCover(isbn) {
	try {
	  const gb = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&country=JP`).then(r => r.json());
	  return fixCover(gb?.items?.[0]?.volumeInfo?.imageLinks?.thumbnail);
	} catch { return null; }
  }
