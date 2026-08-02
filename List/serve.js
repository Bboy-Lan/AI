const http = require('http');
const fs = require('fs');
const path = require('path');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
http.createServer((req, res) => {
  const file = path.join(process.cwd(), req.url === '/' ? 'index.html' : req.url);
  fs.readFile(file, (error, data) => {
    res.statusCode = error ? 404 : 200;
    res.setHeader('Content-Type', mime[path.extname(file)] || 'text/plain');
    res.end(error ? 'Not found' : data);
  });
}).listen(4173, () => console.log('http://localhost:4173'));
