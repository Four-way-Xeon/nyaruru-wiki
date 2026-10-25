'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '../dist');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function createPreviewServer() {
  return http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method not allowed');
      return;
    }
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      let relative = decodeURIComponent(url.pathname);
      if (relative.endsWith('/')) relative += 'index.html';
      if (relative.includes('\\') || relative.includes('\0') || relative.split('/').some(part => part.startsWith('.'))) {
        response.writeHead(404).end('Not found');
        return;
      }
      const filename = path.resolve(root, '.' + relative);
      if (!filename.startsWith(root + path.sep)) {
        response.writeHead(404).end('Not found');
        return;
      }
      const content = await fs.readFile(filename);
      response.writeHead(200, {
        'Content-Type': mime[path.extname(filename).toLowerCase()] || 'application/octet-stream',
        'Content-Length': content.length
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : 404);
      response.end(error instanceof URIError ? 'Bad request' : 'Not found');
    }
  });
}

if (require.main === module) {
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 8789;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('端口需要是 1 到 65535 之间的数字。');
    process.exitCode = 1;
  } else {
    const server = createPreviewServer();
    server.on('error', error => {
      console.error(error.code === 'EADDRINUSE'
        ? `端口 ${port} 已被占用。可换端口：node scripts/preview-server.js --port 8790`
        : `预览服务启动失败：${error.message}`);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`咸鱼喵喵 Wiki：http://127.0.0.1:${port}/`);
      console.log('在浏览器打开上面的地址即可预览。关闭此窗口或按 Ctrl+C 停止。');
    });
    process.on('SIGINT', () => server.close());
    process.on('SIGTERM', () => server.close());
  }
}

module.exports = { createPreviewServer };
