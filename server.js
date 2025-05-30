
// ...



// --- Dubbele initialisaties en event-handlers verwijderd ---
// Tijdelijke opslag voor time-outs
const timeouts = {};

// Simpele moderator accounts (in productie: gebruik een database of veilige opslag)
const moderators = [
  { username: 'mod', password: 'test123' },
  // Voeg meer moderators toe indien gewenst
];

// Chat open/gesloten status
let chatOpen = true;

// Initialiseer app (enkel één keer)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "https://depressieconnect.meoconcept.nl/", // Pas aan naar je WordPress domein
    methods: ["GET", "POST"],
    credentials: true
  }
});


// Endpoint om chatstatus op te vragen
app.get('/chat-status', (req, res) => {
  res.json({ open: chatOpen });
});


// Helper: check moderator (in productie: gebruik sessies/tokens)
function isModeratorSocket(socket) {
  // Eenvoudig: moderator als gebruikersnaam overeenkomt met een moderatoraccount
  return moderators.some((mod) => mod.username === socket.username);
}




// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Moderator login endpoint
app.post('/mod-login', (req, res) => {
  const { username, password } = req.body;
  const found = moderators.find(
    (mod) => mod.username === username && mod.password === password
  );
  if (found) {
    // In productie: gebruik een echte sessie/token
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Ongeldige inloggegevens' });
  }
});

// Simuleer WordPress authenticatie (voor ontwikkeling)
app.post('/auth/wordpress', (req, res) => {
  // In productie: vervang door echte WordPress API calls
  const mockUsers = {
    "admin": "Beheerder",
    "editor": "Redacteur"
  };
  
  const username = req.body.username || 'Anoniem';
  res.json({ 
    success: true,
    data: {
      name: mockUsers[username] || username
    }
  });
});

// Socket.io logica (enkel één keer)
io.on('connection', (socket) => {
  console.log('Nieuwe gebruiker verbonden');

  // Gebruikersnaam instellen
  socket.on('set_username', (username) => {
    socket.username = username || 'Anoniem';
    console.log(`Gebruikersnaam ingesteld: ${socket.username}`);
    // Eventueel: io.emit('user_connected', socket.username);
  });

  // Moderator: chat openen/sluiten
  socket.on('mod_toggle_chat', (open) => {
    if (!isModeratorSocket(socket)) return;
    chatOpen = !!open;
    io.emit('chat_status', { open: chatOpen });
    io.emit('chat message', { user: 'Systeem', text: chatOpen ? 'De chat is geopend door een moderator.' : 'De chat is gesloten door een moderator.', timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) });
  });

  // Moderator commando's
  socket.on('mod_command', (cmd) => {
    if (!isModeratorSocket(socket)) return;
    const { action, target, seconds } = cmd;
    // Zoek target socket
    const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.username === target);
    if (!targetSocket) return;
    if (action === 'kick') {
      targetSocket.emit('mod_action', { action: 'kick' });
      targetSocket.disconnect(true);
      io.emit('chat message', { user: 'Systeem', text: `${target} is gekickt door een moderator.`, timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) });
    } else if (action === 'timeout') {
      const sec = parseInt(seconds, 10) || 60;
      timeouts[targetSocket.id] = Date.now() + sec * 1000;
      targetSocket.emit('mod_action', { action: 'timeout', seconds: sec });
      io.emit('chat message', { user: 'Systeem', text: `${target} heeft een time-out van ${sec} seconden.`, timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) });
    }
  });

  // Berichtafhandeling (let op: eventnaam gelijk aan frontend)
  socket.on('chat message', (messageText) => {
    if (!socket.username) {
      socket.username = 'Anoniem';
    }
    // Check op time-out
    const timeoutUntil = timeouts[socket.id];
    if (timeoutUntil && Date.now() < timeoutUntil) {
      // Negeer berichten tijdens time-out
      return;
    }
    // Check of chat open is
    if (!chatOpen && !isModeratorSocket(socket)) {
      socket.emit('mod_action', { action: 'chat_closed' });
      return;
    }
    const msg = {
      user: socket.username,
      text: messageText,
      timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };
    io.emit('chat message', msg);
  });

  // Verbinding verbroken
  socket.on('disconnect', () => {
    console.log(`${socket.username || 'Onbekende gebruiker'} heeft de chat verlaten`);
    // Eventueel: io.emit('user_disconnected', socket.username);
  });
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server draait op http://localhost:${PORT}`);
});