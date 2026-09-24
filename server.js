/* 静态服务器（本地预览 + 线上托管共用）
   线上要点：
   1) 必须监听 process.env.PORT 且绑定 0.0.0.0
   2) 对 HTML 显式声明 no-store，且**绝不返回 304**
      —— 否则 CDN 边缘节点会一直保留旧页面，用户永远看到旧版本
*/
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || process.argv[2] || 8765);
const HOST = '0.0.0.0';
const ROOT = path.resolve(__dirname);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  let p = '/';
  try {
    p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) { /* 非法 URL 走默认首页 */ }
  if (p === '/' || p === '') p = '/index.html';

  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));

  /* 防目录穿越 */
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(file).toLowerCase();
    const isHtml = ext === '.html' || ext === '.htm';

    /* 关键：不发 Last-Modified / ETag，永远 200 返回完整内容。
       CDN 无法做条件重校验（拿不到 304），只能更新为新版本。 */
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': isHtml
        ? 'no-store, no-cache, must-revalidate, max-age=0'
        : 'public, max-age=300',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(data);
  });
}).listen(PORT, HOST, () => {
  console.log('Douhao diary running at http://' + HOST + ':' + PORT + '/');
});
