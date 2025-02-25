document.addEventListener('DOMContentLoaded', () => {
    let currentLiveId = null;
    let localStream = null;
    let peerConnection = null;
    const peerConnections = {};
    const API_URL = 'http://localhost:3000';
    const socket = io(API_URL);
    
    // Configuración de WebRTC
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    };

    // Socket.IO event handlers
    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('newStreamer', async ({ streamerId }) => {
        if (streamerId !== socket.id) { // Si no somos el streamer
            console.log('Nuevo streamer detectado, solicitando stream...');
            
            // Crear peer connection para el viewer
            peerConnection = new RTCPeerConnection(configuration);
            peerConnections[streamerId] = peerConnection;

            // Configurar el video remoto cuando lleguen los tracks
            peerConnection.ontrack = (event) => {
                const remoteVideo = document.getElementById('remoteVideo');
                if (event.streams && event.streams[0]) {
                    remoteVideo.srcObject = event.streams[0];
                }
            };

            // Enviar candidatos ICE al streamer
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('iceCandidate', {
                        candidate: event.candidate,
                        targetId: streamerId
                    });
                }
            };

            // Crear y enviar oferta al streamer
            try {
                const offer = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                await peerConnection.setLocalDescription(offer);
                
                socket.emit('streamOffer', {
                    liveId: currentLiveId,
                    offer: offer,
                    viewerId: socket.id
                });
            } catch (error) {
                console.error('Error creating offer:', error);
            }
        }
    });

    socket.on('streamOffer', async ({ offer, viewerId }) => {
        try {
            // Crear peer connection para este viewer
            const peerConnection = new RTCPeerConnection(configuration);
            peerConnections[viewerId] = peerConnection;

            // Agregar los tracks del stream local
            if (localStream) {
                localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, localStream);
                });
            }

            // Manejar candidatos ICE
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('iceCandidate', {
                        candidate: event.candidate,
                        targetId: viewerId
                    });
                }
            };

            // Establecer la oferta recibida y crear respuesta
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            // Enviar la respuesta al viewer
            socket.emit('streamAnswer', {
                answer,
                viewerId
            });
        } catch (error) {
            console.error('Error handling viewer offer:', error);
        }
    });

    socket.on('streamAnswer', async ({ answer, streamerId }) => {
        const pc = peerConnections[streamerId];
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });

    socket.on('iceCandidate', async ({ candidate, senderId }) => {
        const pc = peerConnections[senderId];
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });

    socket.on('commentAdded', (comment) => {
        addCommentToList(comment);
    });

    // Formulario para crear live
    const createLiveForm = document.getElementById('createLiveForm');
    createLiveForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(createLiveForm);
        const liveData = {
            title: formData.get('title'),
            description: formData.get('description'),
            creatorName: formData.get('creatorName')
        };

        try {
            const response = await fetch(`${API_URL}/lives`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(liveData)
            });
            if (response.ok) {
                const live = await response.json();
                createLiveForm.reset();
                loadLives();
                viewLive(live.id, true);
            }
        } catch (error) {
            console.error('Error creating live:', error);
        }
    });

    // Cargar lives
    async function loadLives() {
        try {
            const response = await fetch(`${API_URL}/lives`);
            const lives = await response.json();
            const livesList = document.getElementById('livesList');
            livesList.innerHTML = '';

            lives.forEach(live => {
                const liveCard = document.createElement('div');
                liveCard.className = 'live-card bg-gray-50 p-4 rounded-lg border hover:shadow-md';
                liveCard.innerHTML = `
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg font-semibold">${live.title}</h3>
                        <span class="live-status text-red-500 text-sm">EN VIVO</span>
                    </div>
                    <p class="text-gray-600 mt-2">${live.description}</p>
                    <div class="mt-2 text-sm text-gray-500">
                        Creado por: ${live.creatorName}
                    </div>
                    <button onclick="viewLive(${live.id})" class="mt-3 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                        Ver Live
                    </button>
                `;
                livesList.appendChild(liveCard);
            });
        } catch (error) {
            console.error('Error loading lives:', error);
        }
    }

    // Ver live específico
    window.viewLive = async (liveId, isCreator = false) => {
        currentLiveId = liveId;
        try {
            const response = await fetch(`${API_URL}/lives/${liveId}`);
            const live = await response.json();
            
            document.getElementById('currentLive').classList.remove('hidden');
            document.getElementById('liveDetails').innerHTML = `
                <h3 class="text-xl font-bold">${live.title}</h3>
                <p class="text-gray-600 mt-2">${live.description}</p>
                <p class="text-sm text-gray-500 mt-1">Creado por: ${live.creatorName}</p>
            `;

            // Unirse al room del live
            socket.emit('joinLive', liveId.toString());

            // Configurar elementos de video según el rol
            const startStreamBtn = document.getElementById('startStreamBtn');
            const stopStreamBtn = document.getElementById('stopStreamBtn');
            const localVideo = document.getElementById('localVideo');
            const remoteVideo = document.getElementById('remoteVideo');

            if (isCreator) {
                startStreamBtn.classList.remove('hidden');
                localVideo.classList.remove('hidden');
                remoteVideo.classList.add('hidden');
            } else {
                startStreamBtn.classList.add('hidden');
                stopStreamBtn.classList.add('hidden');
                localVideo.classList.add('hidden');
                remoteVideo.classList.remove('hidden');
            }

            loadComments(liveId);
        } catch (error) {
            console.error('Error loading live:', error);
        }
    };

    // Iniciar transmisión
    document.getElementById('startStreamBtn').addEventListener('click', async () => {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: true 
            });
            
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = localStream;
            localVideo.play();

            // Notificar al servidor que estamos iniciando el stream
            socket.emit('startStream', {
                liveId: currentLiveId
            });

            document.getElementById('startStreamBtn').classList.add('hidden');
            document.getElementById('stopStreamBtn').classList.remove('hidden');

        } catch (error) {
            console.error('Error starting stream:', error);
            alert('Error al iniciar la transmisión. Por favor, verifica los permisos de cámara y micrófono.');
        }
    });

    // Detener transmisión
    document.getElementById('stopStreamBtn').addEventListener('click', () => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
            document.getElementById('localVideo').srcObject = null;
            document.getElementById('startStreamBtn').classList.remove('hidden');
            document.getElementById('stopStreamBtn').classList.add('hidden');
        }
    });

    // Crear oferta WebRTC
    async function createOffer() {
        const peerConnection = new RTCPeerConnection(configuration);
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        return offer;
    }

    // Formulario de comentarios
    const commentForm = document.getElementById('commentForm');
    commentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentLiveId) return;

        const formData = new FormData(commentForm);
        const commentData = {
            userName: formData.get('userName'),
            content: formData.get('content'),
            live: { id: currentLiveId }
        };

        try {
            const response = await fetch(`${API_URL}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(commentData)
            });
            if (response.ok) {
                const comment = await response.json();
                commentForm.reset();
                socket.emit('newComment', { liveId: currentLiveId, comment });
            }
        } catch (error) {
            console.error('Error creating comment:', error);
        }
    });

    // Cargar comentarios
    async function loadComments(liveId) {
        try {
            const response = await fetch(`${API_URL}/comments/live/${liveId}`);
            const comments = await response.json();
            const commentsList = document.getElementById('commentsList');
            commentsList.innerHTML = '';

            comments.forEach(comment => {
                addCommentToList(comment);
            });
        } catch (error) {
            console.error('Error loading comments:', error);
        }
    }

    function addCommentToList(comment) {
        const commentsList = document.getElementById('commentsList');
        const commentElement = document.createElement('div');
        commentElement.className = 'comment bg-gray-50 p-3 rounded';
        commentElement.innerHTML = `
            <div class="flex justify-between">
                <span class="font-semibold">${comment.userName}</span>
                <span class="text-xs text-gray-500">${new Date(comment.createdAt).toLocaleString()}</span>
            </div>
            <p class="text-gray-700 mt-1">${comment.content}</p>
        `;
        commentsList.appendChild(commentElement);
        commentsList.scrollTop = commentsList.scrollHeight;
    }

    // Agregar manejadores de eventos para el socket
    socket.on('streamStarted', (data) => {
        console.log('Stream iniciado correctamente', data);
    });

    socket.on('error', (data) => {
        console.error('Error en el streaming:', data.message);
        alert(data.message);
    });

    // Agregar manejo de desconexión del streamer
    socket.on('streamerDisconnected', () => {
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo.srcObject) {
            remoteVideo.srcObject.getTracks().forEach(track => track.stop());
            remoteVideo.srcObject = null;
        }
        
        // Limpiar las conexiones peer
        Object.values(peerConnections).forEach(pc => pc.close());
        peerConnections = {};
    });

    // Cargar lives inicialmente
    loadLives();
});
