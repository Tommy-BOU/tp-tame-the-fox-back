const port = '3000'
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http,{
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

var users = [];

// Quelqu'un rejoint le socket
io.on('connection', function(socket){
    console.log('User is connected');
    // On lui envoie les utilisateurs présents sur le chat
    io.emit('allUsers', users);
    // Il demande à rejoindre le chat avec un pseudo
    socket.on('newUser', function (humeur){
      // On stock l'humeur du nouvel user sur la session du serveur
      socket.humeur = humeur;
      // On ajoute l'utilisateur à la liste des utilisateurs présents, lui donné un uuid, son humeur et un profil vide
      socket.id = require('uuid').v4();
      socket.user = {id: id, humeur: humeur, profile: []};
      users.push(socket.user);
      io.emit('resUser', true);
      // On envoie un message aux autres utilisateurs avec son profil
      io.emit('newUser', {user: socket.user, message: '', status: 1});
      // On met à jour la liste des utilisateurs présents pour tous le monde
      io.emit('allUsers', users);
    })
    // Il envoie un message
    socket.on('message', function (message) {
      // On envoie le message aux autres utilisateurs avec son pseudo récupéré dans la session du serveur
      io.emit('message', {user: socket.user, message: message, status: 0});
    });

    // Un utilisateur écrit sur le profil d'un autre
    socket.on('updateProfile', function (userId, message) {
      const user = users.find((user) => user.id === userId);
      user.profile.push(message);

      // On met à jour la liste des utilisateurs présents pour tous le monde
      io.emit('allUsers', users);
    })
    // Il se deconnecte mais reste sur la page (socket toujours présent)
    socket.on('logout', function () {
      // On le supprime de la liste des utilisateurs
      users.splice(users.indexOf(socket.user), 1);

      // On envoie un message aux autres utilisateurs pour prévenir la déconnexion
      io.emit('logout', {user: socket.user, status: 2});
      // On met à jour la liste des utilisateurs présents pour tout le monde
      io.emit('allUsers', users);
    }); 
    // Il quitte le navigateur
    socket.on('disconnect', function(){
      console.log('User is disconnected');
      // On vérifie s'il a oublié de se deconnecter
      if (users.includes(socket.user)){
        users.splice(users.indexOf(socket.user), 1);
        io.emit('logout', {user: socket.user, status: 2});
        io.emit('allUsers', users);
      }
    });
  });

http.listen(port, function(){
    console.log('listening on port : '+ port);
});
