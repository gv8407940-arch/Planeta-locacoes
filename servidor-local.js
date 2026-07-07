const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { exec } = require("child_process");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = 8765;
const ROOT = __dirname;
const LOCAL_URL = `http://127.0.0.1:${PORT}/index.html?v=22`;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
};

function getNetworkUrls() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((details) => details && details.family === "IPv4" && !details.internal)
    .map((details) => `http://${details.address}:${PORT}/index.html?v=22`);
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Arquivo nao encontrado.");
      return;
    }

    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, LOCAL_URL);
  const cleanPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.resolve(ROOT, `.${decodeURIComponent(cleanPath)}`);

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Acesso negado.");
    return;
  }

  sendFile(response, filePath);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log(`A porta ${PORT} ja esta em uso. Tente abrir: ${LOCAL_URL}`);
    return;
  }

  console.error(error);
});

server.listen(PORT, HOST, () => {
  const networkUrls = getNetworkUrls();
  console.log("Planeta Locacoes rodando.");
  console.log(`Neste computador: ${LOCAL_URL}`);
  console.log("Uso independente no iPhone: publique estes arquivos em uma hospedagem HTTPS gratuita.");
  if (networkUrls.length) {
    console.log("Para teste em outro aparelho na mesma rede Wi-Fi:");
    networkUrls.forEach((url) => console.log(`- ${url}`));
  } else {
    console.log("Nenhum IP de rede local foi encontrado. Verifique o Wi-Fi ou a conexao de rede.");
  }
  if (!process.argv.includes("--no-open")) {
    exec(`start "" "${LOCAL_URL}"`);
  }
});
