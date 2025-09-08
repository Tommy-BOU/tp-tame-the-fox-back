const port = '3000';
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http, {
  origins: '*:*',
  /**
   * Handle preflight request by sending headers with:
   * - "Access-Control-Allow-Headers": "Content-Type, Authorization" to allow
   *   the client to send request with these headers.
   * - "Access-Control-Allow-Origin": "*" to allow request from any origin.
   * - "Access-Control-Allow-Credentials": "true" to allow the client to
   *   send credentials (e.g. cookies, authorization headers) with the request.
   *
   * @param {Object} req - The request object.
   * @param {Object} res - The response object.
   */
  handlePreflightRequest: (req, res) => {
    const headers = {
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true
    };
    res.writeHead(200, headers);
    res.end();
  }
});

// Configuration des humeurs
const MOOD_CONFIG = {
  sun: { icon: '☀️', label: 'Soleil' },
  cloud: { icon: '☁️', label: 'Nuage' },
  question: { icon: '❓', label: 'Question' }
};

// Fonctions utilitaires pour les humeurs
function generateShortId() {
  return Math.random().toString(36).substr(2, 4).toUpperCase();
}

function extractMoodFromPseudo(pseudo) {
  if (pseudo.includes('_sun_')) return 'sun';
  if (pseudo.includes('_cloud_')) return 'cloud';  
  if (pseudo.includes('_question_')) return 'question';
  return null;
}

function createDisplayName(mood, shortId) {
  const config = MOOD_CONFIG[mood];
  return config ? `${config.icon} #${shortId}` : `#${shortId}`;
}

// Deprecated and no longer needed in newer version
// io.set('origins', '*:*');

// Structures de données
var users = []; // Garde la compatibilité avec l'ancien système
var userDetails = new Map(); // Nouveau: stockage des détails utilisateurs
// Structure: socketId -> { pseudo, mood, shortId, displayName, joinedAt }

// Fonction pour broadcaster la liste des utilisateurs avec noms d'affichage
function broadcastUserList() {
  const displayUsers = users.map(pseudo => {
    // Trouver les détails de l'utilisateur
    for (let [socketId, details] of userDetails.entries()) {
      if (details.pseudo === pseudo) {
        return details.displayName;
      }
    }
    return pseudo; // Fallback pour les anciens utilisateurs
  });
  
  console.log('📡 Broadcasting user list:', displayUsers);
  io.emit('allUsers', displayUsers);
}

// Quelqu'un rejoint le socket
io.on('connection', function(socket) {
  console.log('🔗 User is connected:', socket.id);
  
  // On lui envoie les utilisateurs présents sur le chat
  broadcastUserList();
  
  // Il demande à rejoindre le chat avec un pseudo (ou une humeur)
  socket.on('newUser', function(pseudo) {
    console.log('👤 Nouvelle demande de connexion:', pseudo);
    
    // Générer un identifiant unique pour éviter les doublons
    let finalPseudo = pseudo;
    if (users.includes(pseudo)) {
      finalPseudo = pseudo + Math.floor(Math.random() * 100) + 1;
      console.log('⚠️ Pseudo en double, nouveau pseudo:', finalPseudo);
    }
    
    // Détecter si c'est une connexion par humeur
    const mood = extractMoodFromPseudo(finalPseudo);
    let displayName;
    let shortId;
    
    if (mood) {
      // Connexion par humeur
      shortId = generateShortId();
      displayName = createDisplayName(mood, shortId);
      console.log(`🎭 Nouvelle connexion par humeur: ${mood} -> ${displayName}`);
    } else {
      // Connexion classique par pseudo
      displayName = finalPseudo;
      console.log(`👤 Nouvelle connexion classique: ${finalPseudo}`);
    }
    
    // Stocker les détails de l'utilisateur
    userDetails.set(socket.id, {
      pseudo: finalPseudo,
      mood: mood,
      shortId: shortId,
      displayName: displayName,
      joinedAt: new Date()
    });
    
    // On stock le pseudo sur la session du serveur
    socket.pseudo = finalPseudo;
    
    // On ajoute l'utilisateur à la liste des utilisateurs présents
    users.push(finalPseudo);
    
    console.log(`✅ Utilisateur ajouté: ${displayName} (${users.length} connectés)`);
    
    io.emit('resUser', true);
    
    // On envoie un message aux autres utilisateurs avec son nom d'affichage
    io.emit('newUser', {
      pseudo: displayName, // Utiliser le nom d'affichage
      message: '', 
      status: 1
    });
    
    // On met à jour la liste des utilisateurs présents pour tout le monde
    broadcastUserList();
  });
  
  // Il envoie un message
  socket.on('message', function(message) {
    const userDetail = userDetails.get(socket.id);
    const displayName = userDetail ? userDetail.displayName : socket.pseudo;
    
    console.log(`💬 Message de ${displayName}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    
    // On envoie le message aux autres utilisateurs avec le nom d'affichage
    io.emit('message', {
      pseudo: displayName, // Utiliser le nom d'affichage
      message: message, 
      status: 0
    });
  });
  
  // Il se deconnecte mais reste sur la page (socket toujours présent)
  socket.on('logout', function() {
    console.log('👋 Logout demandé pour:', socket.pseudo);
    
    // Récupérer les détails avant suppression
    const userDetail = userDetails.get(socket.id);
    const displayName = userDetail ? userDetail.displayName : socket.pseudo;
    
    // On le supprime de la liste des utilisateurs
    const userIndex = users.indexOf(socket.pseudo);
    if (userIndex > -1) {
      users.splice(userIndex, 1);
      console.log(`🗑️ Utilisateur retiré: ${displayName} (${users.length} restants)`);
    }
    
    // Supprimer les détails
    userDetails.delete(socket.id);
    
    // On envoie un message aux autres utilisateurs pour prévenir la déconnexion
    io.emit('logout', {
      pseudo: displayName, // Utiliser le nom d'affichage
      status: 2
    });
    
    // On met à jour la liste des utilisateurs présents pour tout le monde
    broadcastUserList();
  }); 
  
  // Il quitte le navigateur
  socket.on('disconnect', function() {
    console.log('❌ User is disconnected:', socket.id);
    
    // On vérifie s'il a oublié de se deconnecter
    if (users.includes(socket.pseudo)) {
      const userDetail = userDetails.get(socket.id);
      const displayName = userDetail ? userDetail.displayName : socket.pseudo;
      
      console.log(`🔌 Déconnexion automatique: ${displayName}`);
      
      const userIndex = users.indexOf(socket.pseudo);
      if (userIndex > -1) {
        users.splice(userIndex, 1);
      }
      
      // Nettoyer les détails
      userDetails.delete(socket.id);
      
      io.emit('logout', {
        pseudo: displayName, // Utiliser le nom d'affichage
        status: 2
      });
      
      broadcastUserList();
    }
  });
});

// Route de debug pour voir les utilisateurs connectés (optionnel)
app.get('/api/debug/users', (req, res) => {
  const debugUsers = [];
  for (let [socketId, details] of userDetails.entries()) {
    debugUsers.push({
      socketId: socketId.substr(0, 8),
      pseudo: details.pseudo,
      displayName: details.displayName,
      mood: details.mood,
      shortId: details.shortId,
      joinedAt: details.joinedAt
    });
  }
  res.json({
    totalUsers: users.length,
    users: debugUsers,
    moodStats: getMoodStats()
  });
});

// Route de debug pour les statistiques d'humeurs
function getMoodStats() {
  const stats = { sun: 0, cloud: 0, question: 0, classic: 0 };
  for (let [socketId, details] of userDetails.entries()) {
    if (details.mood) {
      stats[details.mood]++;
    } else {
      stats.classic++;
    }
  }
  return stats;
}

app.get('/api/debug/stats', (req, res) => {
  res.json({
    totalConnected: users.length,
    moodStats: getMoodStats(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
});

// Route de santé pour vérifier que le serveur fonctionne
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    connectedUsers: users.length,
    version: '1.0.0'
  });
});

// Démarrage du serveur
http.listen(port, function() {
  console.log('🦊 ================================');
  console.log('🦊 Serveur TameTheFox démarré !');
  console.log('🦊 ================================');
  console.log(`🌐 Port: ${port}`);
  console.log(`📡 Socket.IO: Actif`);
  console.log(`🔧 Debug: http://localhost:${port}/api/debug/users`);
  console.log(`💊 Health: http://localhost:${port}/api/health`);
  console.log('🦊 ================================');
});

// Affichage périodique des statistiques (toutes les 5 minutes)
setInterval(() => {
  const stats = getMoodStats();
  console.log(`📊 Stats: ${users.length} connectés | ☀️ ${stats.sun} | ☁️ ${stats.cloud} | ❓ ${stats.question} | 👤 ${stats.classic}`);
}, 5 * 60 * 1000);

// Gestion propre de l'arrêt du serveur
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM reçu, arrêt du serveur...');
  http.close(() => {
    console.log('✅ Serveur arrêté proprement');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT reçu (Ctrl+C), arrêt du serveur...');
  http.close(() => {
    console.log('✅ Serveur arrêté proprement');
    process.exit(0);
  });
});

// Gestion des erreurs non gérées
process.on('uncaughtException', (error) => {
  console.error('❌ Erreur non gérée:', error);
  console.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejetée non gérée:', reason);
  console.error('Promise:', promise);
});