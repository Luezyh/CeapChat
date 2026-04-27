# 💬 Ceap Chat

Sistema de chat em tempo real para comunicação entre alunos do curso, rodando localmente na rede da instituição — sem precisar de internet ou conta em nenhum serviço externo.

---

## Sobre o projeto

O Ceap Chat nasceu da necessidade de ter um canal de comunicação simples e direto entre alunos durante as aulas. Basta um computador rodar o servidor e todos os outros na mesma rede já conseguem trocar mensagens pelo navegador, sem instalação de nada.

---

## Como funciona

Um aluno inicia o servidor em sua máquina. Os demais acessam o endereço IP dessa máquina pelo navegador e entram no chat escolhendo um nome. As mensagens são entregues em tempo real para todos os conectados usando WebSocket.

---

## Tecnologias utilizadas

- **Node.js** — servidor
- **WebSocket (ws)** — comunicação em tempo real
- **HTML, CSS e JavaScript** — interface do chat, sem frameworks

---

## Como rodar

**Pré-requisito:** ter o [Node.js](https://nodejs.org) instalado.

**1. Clone o repositório**
```bash
git clone https://github.com/seu-usuario/ceap-chat.git
cd ceap-chat
```

**2. Instale a dependência**
```bash
npm install ws
```

**3. Inicie o servidor**
```bash
node server.js
```

O terminal vai exibir o endereço automaticamente:
```
✅ Ceap Chat rodando!

👉 Nesta máquina:   http://localhost:3000
📡 Outras na rede:  http://192.168.x.x:3000
```

**4. Acesse no navegador**

Todos os alunos na mesma rede abrem o endereço exibido no terminal e escolhem um nome para entrar.

---

## Estrutura do projeto

```
ceap-chat/
├── server.js    # servidor Node.js com WebSocket
└── index.html   # interface do chat (servida pelo próprio servidor)
```

---

## Funcionalidades

- Mensagens em tempo real entre todos os conectados
- Cada usuário recebe uma cor distinta automaticamente
- Lista de usuários online acessível pelo cabeçalho
- Notificações quando alguém entra ou sai do chat
- Descoberta automática do IP da máquina servidora

---

## Licença

Este projeto é de uso livre para fins educacionais.
