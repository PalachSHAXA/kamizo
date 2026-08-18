import { createServer } from 'node:http';

const server = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
    return;
  }
  if (request.url === '/redirect-production') {
    response.writeHead(302, { location: 'https://api.kamizo.uz/api/health' });
    response.end();
    return;
  }
  response.writeHead(404);
  response.end();
});

server.listen(Number(process.env.KAMIZO_E2E_REDIRECT_PORT || 8790), '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
