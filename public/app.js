document.addEventListener('DOMContentLoaded', () => {
    let currentLiveId = null;
    let localStream = null;
    let peerConnection = null;
    const peerConnections = {};
    const API_URL = 'http://localhost:3000/api';
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
        console.log('Nuevo streamer detectado:', streamerId);
        if (streamerId !== socket.id) { // Si no somos el streamer
            try {
                // Crear peer connection para el viewer
                peerConnection = new RTCPeerConnection(configuration);
                peerConnections[streamerId] = peerConnection;

                // Configurar el video remoto cuando lleguen los tracks
                peerConnection.ontrack = (event) => {
                    const remoteVideo = document.getElementById('remoteVideo');
                    if (remoteVideo && event.streams && event.streams[0]) {
                        remoteVideo.srcObject = event.streams[0];
                        remoteVideo.classList.remove('hidden');
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
                console.error('Error conectando con el streamer:', error);
            }
        }
    });

    socket.on('newViewer', async ({ viewerId }) => {
        if (!localStream) return;

        try {
            const peerConnection = new RTCPeerConnection(configuration);
            peerConnections[viewerId] = peerConnection;

            // Agregar los tracks del stream local
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('iceCandidate', {
                        candidate: event.candidate,
                        targetId: viewerId
                    });
                }
            };
        } catch (error) {
            console.error('Error conectando con viewer:', error);
        }
    });

    socket.on('streamOffer', async ({ offer, viewerId }) => {
        if (!localStream) return;

        try {
            const peerConnection = new RTCPeerConnection(configuration);
            peerConnections[viewerId] = peerConnection;

            // Agregar los tracks del stream local
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });

            // Manejar candidatos ICE
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('iceCandidate', {
                        candidate: event.candidate,
                        targetId: viewerId
                    });
                }
            };

            // Establecer la oferta y crear respuesta
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

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
        
        try {
            const formData = new FormData(createLiveForm);
            const liveData = {
                title: formData.get('title'),
                description: formData.get('description'),
                creatorName: formData.get('creatorName'),
                isActive: true
            };

            console.log('Sending live data:', liveData); // Para debugging

            const response = await fetch(`${API_URL}/lives`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(liveData)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                console.error('Server response:', errorData);
                throw new Error(`Error: ${response.status} - ${errorData?.message || 'Error al crear el live'}`);
            }

            const live = await response.json();
            console.log('Live created successfully:', live);

            createLiveForm.reset();
            
            // Generar y mostrar el enlace compartible
            shareUrl = `${window.location.origin}/live/${live.id}`;
            
            // Ir directamente al live creado
            await viewLive(live.id, true);

            // Mostrar el enlace en la UI después de la navegación
            const shareElement = document.createElement('div');
            shareElement.className = 'mt-4 p-4 bg-gray-100 rounded';
            shareElement.innerHTML = `
                <p class="mb-2">Comparte este enlace con tus viewers:</p>
                <div class="flex items-center gap-2">
                    <input type="text" value="${shareUrl}" 
                           class="flex-1 p-2 border rounded" readonly>
                    <button onclick="copyShareLink()" 
                            class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                        Copiar
                    </button>
                </div>
            `;
            document.getElementById('liveDetails').appendChild(shareElement);
            
        } catch (error) {
            console.error('Error creating live:', error);
            alert(error.message || 'Error al crear el live. Por favor, intenta de nuevo.');
        }
    });

    // Función para copiar el enlace
    window.copyShareLink = () => {
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert('Enlace copiado al portapapeles!');
        });
    };

    // Al inicio del archivo, después de las variables globales
    const handleRoute = () => {
        const path = window.location.pathname;
        const liveMatch = path.match(/\/live\/(\d+)/);
        
        if (liveMatch) {
            const liveId = parseInt(liveMatch[1]);
            viewLive(liveId, false);
        } else {
            loadLives();
        }
    };

    // Modificar la función loadLives
    async function loadLives() {
        try {
            const response = await fetch(`${API_URL}/lives`);
            if (!response.ok) {
                throw new Error(`Error: ${response.status}`);
            }
            
            const lives = await response.json();
            const livesList = document.getElementById('livesList');
            livesList.innerHTML = '';

            if (lives.length === 0) {
                livesList.innerHTML = `
                    <div class="col-span-full text-center py-8 text-gray-500">
                        No hay transmisiones disponibles en este momento
                    </div>
                `;
                return;
            }

            lives.forEach(live => {
                const isActive = live.isActive;
                const liveCard = document.createElement('div');
                liveCard.className = 'live-card bg-white p-6 rounded-lg border border-gray-200 hover:shadow-lg transition-all duration-300';
                liveCard.innerHTML = `
                    <div class="flex justify-between items-start mb-4">
                        <h3 class="text-xl font-semibold text-gray-800">${live.title}</h3>
                        ${isActive ? `
                            <span class="flex items-center space-x-1">
                                <span class="inline-block w-2 h-2 bg-red-500 rounded-full live-indicator"></span>
                                <span class="text-red-500 text-sm font-medium">EN VIVO</span>
                            </span>
                        ` : ''}
                    </div>
                    <p class="text-gray-600 mb-4 line-clamp-2">${live.description}</p>
                    <div class="flex justify-between items-center">
                        <div class="text-sm text-gray-500">
                            <span class="font-medium">Creador:</span> ${live.creatorName}
                        </div>
                        <button onclick="viewLive(${live.id})" 
                                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200">
                            ${isActive ? 'Ver Live' : 'Ver Detalles'}
                        </button>
                    </div>
                    ${isActive ? `
                        <div class="mt-4 pt-4 border-t border-gray-100">
                            <div class="flex items-center space-x-2 text-sm text-gray-600">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <span id="viewerCount_${live.id}">0 viewers</span>
                            </div>
                        </div>
                    ` : ''}
                `;
                livesList.appendChild(liveCard);
            });

            // Mostrar la lista de lives
            document.getElementById('livesList').parentElement.classList.remove('hidden');
            document.getElementById('currentLive').classList.add('hidden');
        } catch (error) {
            console.error('Error loading lives:', error);
            document.getElementById('livesList').innerHTML = `
                <div class="col-span-full text-center py-8 text-red-500">
                    Error al cargar las transmisiones. Por favor, recarga la página.
                </div>
            `;
        }
    }

    // Ver live específico
    window.viewLive = async (liveId, isCreator = false) => {
        currentLiveId = liveId;
        try {
            const response = await fetch(`${API_URL}/lives/${liveId}`);
            if (!response.ok) {
                throw new Error(`Error: ${response.status}`);
            }
            const live = await response.json();
            
            // Ocultar la lista de lives y mostrar el live actual
            document.getElementById('livesList').parentElement.classList.add('hidden');
            document.getElementById('currentLive').classList.remove('hidden');
            
            const liveDetails = document.getElementById('liveDetails');
            liveDetails.innerHTML = `
                <button onclick="goBack()" class="mb-4 text-blue-500 hover:text-blue-600">
                    ← Volver a la lista
                </button>
                <h3 class="text-xl font-bold">${live.title}</h3>
                <p class="text-gray-600 mt-2">${live.description}</p>
                <p class="text-sm text-gray-500 mt-1">Creado por: ${live.creatorName}</p>
                <div class="mt-2 text-sm font-semibold">
                    <span id="viewerCount">0</span> viewers
                </div>
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
                
                // Generar y mostrar el enlace compartible
                shareUrl = `${window.location.origin}/live/${liveId}`;
                const shareElement = document.createElement('div');
                shareElement.className = 'mt-4 p-4 bg-gray-100 rounded';
                shareElement.innerHTML = `
                    <p class="mb-2">Comparte este enlace con tus viewers:</p>
                    <div class="flex items-center gap-2">
                        <input type="text" value="${shareUrl}" 
                               class="flex-1 p-2 border rounded" readonly>
                        <button onclick="copyShareLink()" 
                                class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                            Copiar
                        </button>
                    </div>
                `;
                liveDetails.appendChild(shareElement);
            } else {
                startStreamBtn.classList.add('hidden');
                stopStreamBtn.classList.add('hidden');
                localVideo.classList.add('hidden');
                remoteVideo.classList.remove('hidden');
            }

            loadComments(liveId);

            // Actualizar la URL sin recargar la página
            window.history.pushState({}, '', `/live/${liveId}`);
        } catch (error) {
            console.error('Error loading live:', error);
            alert('Error al cargar el live. Por favor, intenta de nuevo.');
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
            liveId: currentLiveId
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
                socket.emit('newComment', { 
                    liveId: currentLiveId, 
                    comment: {
                        ...comment,
                        userName: commentData.userName
                    }
                });
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
        commentElement.className = 'comment bg-gray-50 p-3 rounded mb-2';
        commentElement.innerHTML = `
            <div class="flex justify-between">
                <span class="font-semibold">${comment.userName}</span>
                <span class="text-xs text-gray-500">${new Date(comment.timestamp).toLocaleString()}</span>
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

    // Agregar el manejador para actualización de viewers
    socket.on('viewerCountUpdate', ({ count }) => {
        const viewerCountElement = document.getElementById('viewerCount');
        if (viewerCountElement) {
            viewerCountElement.textContent = count;
        }
    });

    // Función para volver a la lista
    window.goBack = () => {
        window.history.pushState({}, '', '/');
        loadLives();
    };

    // Agregar manejadores de eventos para la navegación
    window.addEventListener('popstate', handleRoute);
    window.addEventListener('DOMContentLoaded', handleRoute);
});
