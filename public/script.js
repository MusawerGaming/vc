const socket = io();

let localStream;
let peers = {};
let audioMuted = false;
let videoOff = true; // camera off by default
let username = "";
const FIXED_ROOM = "main";

const joinDiv = document.getElementById('join');
const roomDiv = document.getElementById('room');
const roomNameEl = document.getElementById('roomName');
const nameInput = document.getElementById('nameInput');
const joinBtn = document.getElementById('joinBtn');
const videosDiv = document.getElementById('videos');
const muteBtn = document.getElementById('muteBtn');
const cameraBtn = document.getElementById('cameraBtn');

joinBtn.onclick = async () => {
  username = nameInput.value.trim();
  if (!username) return alert("Enter a name first");

  await startMedia();
  joinRoom(FIXED_ROOM);
};

muteBtn.onclick = () => {
  audioMuted = !audioMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !audioMuted);
  muteBtn.textContent = audioMuted ? 'Unmute' : 'Mute';

  // Update local mute indicator
  const localVideo = document.getElementById("local-video");
  const localIcon = document.getElementById("mute-local");
  if (audioMuted) {
    localVideo.classList.add("muted");
  } else {
    localVideo.classList.remove("muted");
  }

  // Tell others
  socket.emit("mute-changed", { muted: audioMuted });
};

// REAL camera toggle (stop hardware + restart)
cameraBtn.onclick = async () => {
  videoOff = !videoOff;

  if (videoOff) {
    // FULL STOP camera hardware
    localStream.getVideoTracks().forEach(t => t.stop());
    cameraBtn.textContent = "Camera on";
  } else {
    // RESTART camera hardware
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const newTrack = stream.getVideoTracks()[0];

    // Replace track in all peer connections
    Object.values(peers).forEach(({ peer }) => {
      const sender = peer.getSenders().find(s => s.track && s.track.kind === "video");
      if (sender) sender.replaceTrack(newTrack);
    });

    // Update local stream
    const oldTrack = localStream.getVideoTracks()[0];
    if (oldTrack) localStream.removeTrack(oldTrack);
    localStream.addTrack(newTrack);

    // Update local video element
    document.getElementById("local-video").srcObject = localStream;

    cameraBtn.textContent = "Camera off";
  }
};

async function startMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  // Camera OFF by default
  localStream.getVideoTracks().forEach(t => t.stop());
  cameraBtn.textContent = "Camera on";

  // Create container
  const container = document.createElement("div");
  container.className = "video-container";
  container.id = "container-local";

  const localVideo = document.createElement('video');
  localVideo.srcObject = localStream;
  localVideo.autoplay = true;
  localVideo.muted = true;
  localVideo.id = "local-video";
  container.appendChild(localVideo);

  // Username label
  const label = document.createElement('div');
  label.className = "name-label";
  label.textContent = username;
  label.id = "label-local";
  container.appendChild(label);

  // Mute indicator
  const muteIcon = document.createElement("div");
  muteIcon.className = "mute-indicator";
  muteIcon.id = "mute-local";
  muteIcon.textContent = "Muted";
  container.appendChild(muteIcon);

  videosDiv.appendChild(container);

  // Speaking detection
  setupSpeakingDetection(localVideo, localStream);
}

function joinRoom(room) {
  joinDiv.classList.add('hidden');
  roomDiv.classList.remove('hidden');
  roomNameEl.textContent = `Room: ${room}`;

  socket.emit('join-room', { room, username });
}

socket.on('user-joined', async ({ id, username }) => {
  const peer = createPeer(id, true);
  peers[id] = { peer, username };
});

socket.on('signal', async ({ from, signal }) => {
  let entry = peers[from];
  if (!entry) {
    const peer = createPeer(from, false);
    peers[from] = { peer, username: "User" };
    entry = peers[from];
  }

  const peer = entry.peer;

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
    peers[userId].peer.close();
    delete peers[userId];
  }

  const container = document.getElementById(`container-${userId}`);
  if (container) container.remove();
});

// 🔊 Remote mute indicator update
socket.on("user-muted", ({ id, muted }) => {
  const video = document.getElementById(`video-${id}`);
  const icon = document.getElementById(`mute-${id}`);

  if (!video || !icon) return;

  if (muted) {
    video.classList.add("muted");
  } else {
    video.classList.remove("muted");
  }
});

function createPeer(userId, isInitiator) {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  // Add tracks (audio always, video only if camera is on)
  localStream.getTracks().forEach(track => {
    peer.addTrack(track, localStream);
  });

  peer.ontrack = (event) => {
    const [stream] = event.streams;

    let container = document.getElementById(`container-${userId}`);
    if (!container) {
      container = document.createElement("div");
      container.className = "video-container";
      container.id = `container-${userId}`;
      videosDiv.appendChild(container);
    }

    let video = document.getElementById(`video-${userId}`);
    if (!video) {
      video = document.createElement('video');
      video.id = `video-${userId}`;
      video.autoplay = true;
      container.appendChild(video);
    }

    video.srcObject = stream;

    // Username label
    let label = document.getElementById(`label-${userId}`);
    if (!label) {
      label = document.createElement('div');
      label.id = `label-${userId}`;
      label.className = "name-label";
      label.textContent = peers[userId]?.username || "User";
      container.appendChild(label);
    }

    // Mute indicator
    let muteIcon = document.getElementById(`mute-${userId}`);
    if (!muteIcon) {
      muteIcon = document.createElement("div");
      muteIcon.className = "mute-indicator";
      muteIcon.id = `mute-${userId}`;
      muteIcon.textContent = "Muted";
      container.appendChild(muteIcon);
    }

    // Speaking detection
    setupSpeakingDetection(video, stream);
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

// 🔊 SPEAKING DETECTION
function setupSpeakingDetection(videoElement, stream) {
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);

  function detect() {
    analyser.getByteFrequencyData(data);
    let volume = data.reduce((a, b) => a + b) / data.length;

    if (volume > 30) {
      videoElement.classList.add("speaking");
    } else {
      videoElement.classList.remove("speaking");
    }

    requestAnimationFrame(detect);
  }

  detect();
}
