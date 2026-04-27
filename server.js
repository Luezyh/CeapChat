// ============================================================
//  CEAP CHAT - Servidor com sistema de jogo
// ============================================================

const http = require("http");
const fs   = require("fs");
const path = require("path");
const os   = require("os");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.values(interfaces)) {
    for (const iface of name) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

// ── Cores dos usuários ────────────────────────────────────────
const CORES = ["#f97316","#3b82f6","#22c55e","#ec4899","#a855f7","#eab308","#06b6d4","#ef4444"];
let indiceCor = 0;

// ── Estado do chat ────────────────────────────────────────────
// Map: ws → { name, color, isAdmin }
let clients = new Map();

// ── Estado do jogo ────────────────────────────────────────────
let palavras  = [];   // lista de palavras cadastradas pelo admin
let jogoAtivo = false;

// ── Servidor HTTP ─────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const filePath = path.join(__dirname, "index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end("index.html não encontrado."); return; }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
  } else {
    res.writeHead(404); res.end("Não encontrado.");
  }
});

// ── Servidor WebSocket ────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

function broadcast(dados) {
  const msg = JSON.stringify(dados);
  for (const [ws] of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function enviarPara(ws, dados) {
  if (ws.readyState === 1) ws.send(JSON.stringify(dados));
}

function enviarListaUsuarios() {
  const usuarios = [...clients.values()].map(c => ({
    name: c.name, color: c.color, isAdmin: c.isAdmin
  }));
  broadcast({ type: "user_list", users: usuarios });
}

function enviarPalavrasParaAdmin() {
  for (const [ws, cliente] of clients) {
    if (cliente.isAdmin) {
      enviarPara(ws, { type: "word_list", words: palavras });
    }
  }
}

// ── Lógica principal de conexão ───────────────────────────────
wss.on("connection", (ws) => {
  const cor = CORES[indiceCor % CORES.length];
  indiceCor++;
  const ehAdmin = clients.size === 0;
  clients.set(ws, { name: null, color: cor, isAdmin: ehAdmin });

  ws.on("message", (raw) => {
    let dados;
    try { dados = JSON.parse(raw); } catch { return; }
    const cliente = clients.get(ws);

    // ── join ──────────────────────────────────────────────────
    if (dados.type === "join") {
      const nome = String(dados.name || "Anônimo").slice(0, 20);
      cliente.name = nome;
      clients.set(ws, cliente);
      enviarPara(ws, { type: "welcome", name: nome, color: cliente.color, isAdmin: cliente.isAdmin });
      if (cliente.isAdmin) enviarPara(ws, { type: "word_list", words: palavras });
      broadcast({ type: "system", text: `${nome} entrou no chat`, time: new Date().toISOString() });
      enviarListaUsuarios();

    // ── message ───────────────────────────────────────────────
    } else if (dados.type === "message") {
      if (!cliente.name) return;
      broadcast({
        type: "message",
        from: cliente.name,
        color: cliente.color,
        text: String(dados.text || "").slice(0, 2000),
        time: new Date().toISOString(),
        // Repassa os dados de resposta, se houver
        replyTo: dados.replyTo || null
      });

    // ── add_word ──────────────────────────────────────────────
    } else if (dados.type === "add_word") {
      if (!cliente.isAdmin) return;
      const palavra = String(dados.word || "").trim().slice(0, 50);
      if (!palavra || palavras.includes(palavra)) return;
      palavras.push(palavra);
      enviarPalavrasParaAdmin();

    // ── remove_word ───────────────────────────────────────────
    } else if (dados.type === "remove_word") {
      if (!cliente.isAdmin) return;
      palavras = palavras.filter(p => p !== dados.word);
      enviarPalavrasParaAdmin();

    // ── reset_words: admin limpou toda a lista ────────────────
    } else if (dados.type === "reset_words") {
      if (!cliente.isAdmin) return;
      palavras = []; // esvazia o array
      enviarPalavrasParaAdmin();

    // ── start_game ────────────────────────────────────────────
    } else if (dados.type === "start_game") {
      if (!cliente.isAdmin) return;
      const jogadores = [...clients.values()].filter(c => c.name);
      if (jogadores.length < 2) {
        enviarPara(ws, { type: "game_error", text: "Precisa de pelo menos 2 jogadores." });
        return;
      }
      if (palavras.length === 0) {
        enviarPara(ws, { type: "game_error", text: "Adicione pelo menos uma palavra." });
        return;
      }
      jogoAtivo = true;
      const palavraEscolhida = palavras[Math.floor(Math.random() * palavras.length)];
      const impostorIndex    = Math.floor(Math.random() * jogadores.length);
      const impostorNome     = jogadores[impostorIndex].name;
      broadcast({ type: "system", text: "🎮 Jogo do Impostor começou! Verifique sua tela.", time: new Date().toISOString() });
      for (const [wsJogador, dadosJogador] of clients) {
        if (!dadosJogador.name) continue;
        const ehImpostor = dadosJogador.name === impostorNome;
        enviarPara(wsJogador, { type: "game_start", isImpostor: ehImpostor, word: ehImpostor ? null : palavraEscolhida });
      }

    // ── end_game ──────────────────────────────────────────────
    } else if (dados.type === "end_game") {
      if (!cliente.isAdmin) return;
      jogoAtivo = false;
      broadcast({ type: "game_end" });
    }
  });

  // ── Desconexão ───────────────────────────────────────────────
  ws.on("close", () => {
    const cliente = clients.get(ws);
    clients.delete(ws);
    if (cliente && cliente.name) {
      if (cliente.isAdmin && clients.size > 0) {
        const [proximoWs, proximoCliente] = clients.entries().next().value;
        proximoCliente.isAdmin = true;
        clients.set(proximoWs, proximoCliente);
        enviarPara(proximoWs, { type: "promoted", words: palavras });
        broadcast({ type: "system", text: `${proximoCliente.name} agora é o admin.`, time: new Date().toISOString() });
      }
      broadcast({ type: "system", text: `${cliente.name} saiu do chat`, time: new Date().toISOString() });
      enviarListaUsuarios();
    }
  });
});

// ── Inicia o servidor ─────────────────────────────────────────
httpServer.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIP();
  console.log(`\n✅ Ceap Chat rodando!`);
  console.log(`\n👉 Nesta máquina:   http://localhost:${PORT}`);
  console.log(`📡 Outras na rede:  http://${ip}:${PORT}`);
  console.log(`\n👑 O primeiro a entrar vira admin e controla o jogo.\n`);
});