// ============================================================
//  CEAP CHAT - Servidor com sistema de jogo
// ============================================================

const http = require("http");
const fs   = require("fs");
const path = require("path");
const os   = require("os");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 10000;

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
let palavras   = [];      // lista de palavras cadastradas pelo admin
let jogoAtivo  = false;   // true enquanto um jogo está rolando

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

// Envia para todos os clientes conectados
function broadcast(dados) {
  const msg = JSON.stringify(dados);
  for (const [ws] of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// Envia apenas para um cliente específico
function enviarPara(ws, dados) {
  if (ws.readyState === 1) ws.send(JSON.stringify(dados));
}

// Envia a lista de usuários online para todos
function enviarListaUsuarios() {
  const usuarios = [...clients.values()].map(c => ({
    name: c.name, color: c.color, isAdmin: c.isAdmin
  }));
  broadcast({ type: "user_list", users: usuarios });
}

// Envia a lista de palavras apenas para o admin
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

  // O primeiro usuário a se conectar é o admin
  const ehAdmin = clients.size === 0;
  clients.set(ws, { name: null, color: cor, isAdmin: ehAdmin });

  // ── Receber mensagens ────────────────────────────────────────
  ws.on("message", (raw) => {
    let dados;
    try { dados = JSON.parse(raw); } catch { return; }

    const cliente = clients.get(ws);

    // ── join: usuário escolheu um nome ────────────────────────
    if (dados.type === "join") {
      const nome = String(dados.name || "Anônimo").slice(0, 20);
      cliente.name = nome;
      clients.set(ws, cliente);

      // Informa o cliente seus próprios dados (incluindo se é admin)
      enviarPara(ws, {
        type: "welcome",
        name: nome,
        color: cliente.color,
        isAdmin: cliente.isAdmin
      });

      // Se for admin, manda também a lista de palavras já cadastradas
      if (cliente.isAdmin) {
        enviarPara(ws, { type: "word_list", words: palavras });
      }

      broadcast({
        type: "system",
        text: `${nome} entrou no chat`,
        time: new Date().toISOString()
      });

      enviarListaUsuarios();

    // ── message: mensagem de chat normal ─────────────────────
    } else if (dados.type === "message") {
      if (!cliente.name) return;
      broadcast({
        type: "message",
        from: cliente.name,
        color: cliente.color,
        text: String(dados.text || "").slice(0, 2000),
        time: new Date().toISOString()
      });

    // ── add_word: admin adicionou uma palavra à lista ─────────
    } else if (dados.type === "add_word") {
      if (!cliente.isAdmin) return; // só admin pode fazer isso
      const palavra = String(dados.word || "").trim().slice(0, 50);
      if (!palavra || palavras.includes(palavra)) return; // ignora vazia ou duplicada
      palavras.push(palavra);
      enviarPalavrasParaAdmin(); // atualiza o painel do admin

    // ── remove_word: admin removeu uma palavra ────────────────
    } else if (dados.type === "remove_word") {
      if (!cliente.isAdmin) return;
      palavras = palavras.filter(p => p !== dados.word);
      enviarPalavrasParaAdmin();

    // ── start_game: admin iniciou o jogo ─────────────────────
    } else if (dados.type === "start_game") {
      if (!cliente.isAdmin) return;

      // Precisa de pelo menos 2 jogadores e 1 palavra
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

      // Sorteia uma palavra aleatória da lista
      const palavraEscolhida = palavras[Math.floor(Math.random() * palavras.length)];

      // Sorteia um impostor aleatório entre os jogadores
      const impostorIndex = Math.floor(Math.random() * jogadores.length);
      const impostorNome  = jogadores[impostorIndex].name;

      // Avisa no chat que o jogo começou (sem revelar nada)
      broadcast({
        type: "system",
        text: "🎮 O jogo começou! Verifique sua tela.",
        time: new Date().toISOString()
      });

      // Envia o resultado individualmente para cada jogador
      for (const [wsJogador, dadosJogador] of clients) {
        if (!dadosJogador.name) continue;

        const ehImpostor = dadosJogador.name === impostorNome;

        enviarPara(wsJogador, {
          type: "game_start",
          isImpostor: ehImpostor,
          // O impostor recebe palavra null (não sabe a palavra)
          word: ehImpostor ? null : palavraEscolhida
        });
      }

    // ── end_game: admin encerrou o jogo ──────────────────────
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
      // Se o admin saiu, o próximo usuário vira admin
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