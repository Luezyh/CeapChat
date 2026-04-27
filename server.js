// ============================================================
//  CEAP CHAT - Servidor
//  Como funciona:
//    1. Um servidor HTTP serve o arquivo index.html
//    2. Um servidor WebSocket gerencia as conexões de chat
//    3. Quando alguém manda mensagem, o servidor repassa
//       para todos os outros conectados (broadcast)
// ============================================================

const http = require("http"); // módulo nativo do Node para criar servidores HTTP
const fs   = require("fs");   // módulo nativo para ler arquivos do disco
const path = require("path"); // módulo nativo para montar caminhos de arquivos
const os   = require("os");   // módulo nativo para informações do sistema (usado para pegar o IP)
const { WebSocketServer } = require("ws"); // biblioteca de WebSocket (instale com: npm install ws)

// ── Configurações gerais ─────────────────────────────────────
const PORT = 3000; // porta onde o servidor vai rodar

// Função para descobrir o IP local da máquina automaticamente
// Assim não precisa rodar ipconfig manualmente
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.values(interfaces)) {
    for (const iface of name) {
      // Pega o primeiro endereço IPv4 que não seja loopback (127.0.0.1)
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost"; // fallback se não achar nenhum
}

// ── Cores disponíveis para os usuários ───────────────────────
// Cada usuário que entrar vai receber uma cor diferente
// automaticamente, para diferenciar quem falou o quê
const CORES = [
  "#f97316", // laranja
  "#3b82f6", // azul
  "#22c55e", // verde
  "#ec4899", // rosa
  "#a855f7", // roxo
  "#eab308", // amarelo
  "#06b6d4", // ciano
  "#ef4444", // vermelho
];
let indiceCor = 0; // controla qual cor será dada ao próximo usuário

// ── Tabela de clientes conectados ────────────────────────────
// Map é como uma tabela: associa cada conexão WebSocket
// ao usuário dono dela.
// Estrutura: ws (conexão) → { name: "João", color: "#f97316" }
let clients = new Map();

// ── Servidor HTTP ─────────────────────────────────────────────
// Ele tem uma única função: entregar o index.html quando
// alguém abre o endereço no navegador
const httpServer = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    // Lê o arquivo index.html da mesma pasta que este server.js
    const filePath = path.join(__dirname, "index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Arquivo index.html não encontrado. Coloque-o na mesma pasta que server.js.");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end("Página não encontrada.");
  }
});

// ── Servidor WebSocket ────────────────────────────────────────
// Roda junto com o HTTP na mesma porta.
// Responsável por receber e redistribuir as mensagens do chat.
const wss = new WebSocketServer({ server: httpServer });

// ── Função de broadcast ───────────────────────────────────────
// Envia uma mensagem para TODOS os usuários conectados.
// Usada sempre que alguém manda algo no chat.
function broadcast(dados) {
  const msg = JSON.stringify(dados); // converte o objeto JS para texto JSON
  for (const [ws] of clients) {     // percorre todos os clientes no Map
    if (ws.readyState === 1) {       // readyState 1 = conexão ainda aberta
      ws.send(msg);
    }
  }
}

// ── Função de lista de usuários ───────────────────────────────
// Monta e envia para todos a lista atualizada de quem está online.
// Chamada sempre que alguém entra ou sai.
function enviarListaUsuarios() {
  const usuarios = [...clients.values()].map(c => ({
    name: c.name,
    color: c.color
  }));
  broadcast({ type: "user_list", users: usuarios });
}

// ── Eventos do WebSocket ──────────────────────────────────────
// "connection" dispara toda vez que um novo navegador se conecta
wss.on("connection", (ws) => {

  // Dá uma cor para este usuário e salva no Map
  const cor = CORES[indiceCor % CORES.length];
  indiceCor++;
  clients.set(ws, { name: null, color: cor });

  // ── Receber mensagens ────────────────────────────────────────
  // Dispara toda vez que este usuário manda qualquer coisa
  ws.on("message", (raw) => {
    let dados;
    try {
      dados = JSON.parse(raw); // tenta converter o texto recebido em objeto JS
    } catch {
      return; // se não for JSON válido, ignora
    }

    const cliente = clients.get(ws); // pega as informações deste usuário no Map

    // ── Tipo "join": usuário entrou com um nome ──────────────
    if (dados.type === "join") {
      const nome = String(dados.name || "Anônimo").slice(0, 20); // limita a 20 caracteres
      cliente.name = nome;
      clients.set(ws, cliente); // atualiza no Map

      // Manda de volta para este usuário suas próprias informações (nome e cor)
      ws.send(JSON.stringify({
        type: "welcome",
        name: nome,
        color: cliente.color
      }));

      // Avisa todo mundo que este usuário entrou
      broadcast({
        type: "system",
        text: `${nome} entrou no chat`,
        time: new Date().toISOString()
      });

      enviarListaUsuarios(); // atualiza a lista de online para todos

    // ── Tipo "message": usuário mandou uma mensagem de texto ──
    } else if (dados.type === "message") {
      if (!cliente.name) return; // ignora se o usuário ainda não fez join

      // Repassa a mensagem para todos, adicionando quem enviou e a hora
      broadcast({
        type: "message",
        from: cliente.name,
        color: cliente.color,
        text: String(dados.text || "").slice(0, 2000), // limita a 2000 caracteres
        time: new Date().toISOString()
      });
    }
  });

  // ── Usuário desconectou ──────────────────────────────────────
  // Dispara quando o navegador fecha ou perde conexão
  ws.on("close", () => {
    const cliente = clients.get(ws);
    clients.delete(ws); // remove do Map

    // Se o usuário tinha nome, avisa todo mundo que ele saiu
    if (cliente && cliente.name) {
      broadcast({
        type: "system",
        text: `${cliente.name} saiu do chat`,
        time: new Date().toISOString()
      });
      enviarListaUsuarios(); // atualiza lista de online
    }
  });
});

// ── Inicia o servidor ─────────────────────────────────────────
// "0.0.0.0" significa: aceitar conexões de qualquer IP da rede
httpServer.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIP();
  console.log(`\n✅ Ceap Chat rodando!`);
  console.log(`\n👉 Nesta máquina:   http://localhost:${PORT}`);
  console.log(`📡 Outras na rede:  http://${ip}:${PORT}\n`);
});
