const socket = io();

let localStream;
let peers = {};
let roomId = null;
let audioMuted = false;
let videoOff = false;

const joinDiv = document.getElementById('join');
const roomDiv = document.getElementById('room');
const roomNameEl = document.getElementById('roomName');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const videosDiv = document.getElementById('videos');
const muteBtn = document.getElementById('muteBtn');
const cameraBtn = document.getElementById('cameraBtn');

joinBtn.onclick = async () => {
  roomId = roomInput.value.trim() || 'default';
  await startMedia();
  joinRoom(roomId);
};

muteBtn.onclick = () => {
  audioMuted = !audioMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !audioMuted);
  muteBtn.textContent = audioMuted ? 'Unmute' : 'Mute';
};

cameraBtn.onclick = () => {
  videoOff = !videoOff;
  localStream.getVideoTracks().forEach(t => t.enabled = !videoOff);
  cameraBtn.textContent = videoOff ? 'Camera on' : 'Camera off';
};

async function startMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  const localVideo = document.createElement('video');
  localVideo.srcObject = localStream;
  localVideo.autoplay = true;
  localVideo.muted = true;
  videosDiv.appendChild(localVideo);
}

function joinRoom(room) {
  joinDiv.classList.add('hidden');
  roomDiv.classList.remove('hidden');
  roomNameEl.textContent = `Room: ${room}`;
  socket.emit('join-room', room);
}

socket.on('user-joined', async (userId) => {
  const peer = createPeer(userId, true);
  peers[userId] = peer;
});

socket.on('signal', async ({ from, signal }) => {
  let peer = peers[from];
  if (!peer) {
    peer = createPeer(from, false);
    peers[from] = peer;
  }
  if (signal.sdp) {
    await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    if (signal.sdp.type === 'offer') {
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('signal', {
        target: from,
        signal: { sdp: peer.localDescription }
      });
    }
  }
  if (signal.candidate) {
    try {
      await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
    } catch (e) {
      console.error(e);
    }
  }
});

socket.on('user-left', (userId) => {
  if (peers[userId]) {
    peers[userId].close();
    delete peers[userId];
  }
  const vid = document.getElementById(`video-${userId}`);
  if (vid) vid.remove();
});

function createPeer(userId, isInitiator) {
  const peer = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  });

  localStream.getTracks().forEach(track => {
    peer.addTrack(track, localStream);
  });

  peer.ontrack = (event) => {
    const [stream] = event.streams;
    let video = document.getElementById(`video-${userId}`);
    if (!video) {
      video = document.createElement('video');
      video.id = `video-${userId}`;
      video.autoplay = true;
      videosDiv.appendChild(video);
    }
    video.srcObject = stream;
  };

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', {
        target: userId,
        signal: { candidate: event.candidate }
      });
    }
  };

  if (isInitiator) {
    peer.onnegotiationneeded = async () => {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit('signal', {
        target: userId,
        signal: { sdp: peer.localDescription }
      });
    };
  }

  return peer;
}
