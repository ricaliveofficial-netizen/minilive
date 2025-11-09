// client/client.js
const socket = io(); // server must serve socket.io

let localStream = null;
let pcMap = {}; // for broadcaster: viewerId => RTCPeerConnection
let viewerPc = null; // for viewer
let myRole = null;
let myUserId = null;
let myRoomId = null;
let micOn = true;

const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const userIdInput = document.getElementById('userId');
const roomIdInput = document.getElementById('roomId');
const logDiv = document.getElementById('log');
const seats = document.querySelectorAll('.seat');

function log(msg){
  logDiv.textContent = msg;
  console.log(msg);
}

/* Seat helper: map socketId to seat index */
const seatAssign = { broadcaster: null, viewers: [] }; // broadcaster socketId, viewers array of {id, name, seatIndex}

function updateSeatsUI(){
  // clear
  seats.forEach(s => {
    s.querySelector('.name').textContent = 'Empty';
    s.querySelector('.avatar').style.backgroundImage = '';
    s.querySelector('.avatar').style.opacity = '1';
  });
  // broadcaster -> seat 0 if exists
  if (seatAssign.broadcaster) {
    const el = seats[0];
    el.querySelector('.name').textContent = seatAssign.broadcaster.name || 'Host';
    el.querySelector('.avatar').style.backgroundImage = `url('')`;
  }
  // viewers fill remaining seats
  seatAssign.viewers.forEach((v, i) => {
    const idx = i+1; // from seat 1..8
    if (idx < seats.length) {
      const el = seats[idx];
      el.querySelector('.name').textContent = v.name || 'User';
      el.querySelector('.avatar').style.backgroundImage = `url('')`;
    }
  });
}

/* Get microphone */
async function startLocalAudio(){
  try{
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    log('Local audio ready');
  }catch(err){
    alert('Mic not available: ' + err.message);
  }
}

/* join room button */
joinBtn.onclick = async () => {
  const uid = userIdInput.value.trim() || ('u' + Math.floor(Math.random()*10000));
  const rid = roomIdInput.value.trim() || 'default';
  myUserId = uid;
  myRoomId = rid;

  // we will ask the server whether we should be broadcaster or viewer
  // for simplicity: first person to join becomes broadcaster
  // we'll request server room-state (not implemented fully) — but here choose role manually:
  const role = prompt('Type role: broadcaster or viewer', 'viewer');
  myRole = role === 'broadcaster' ? 'broadcaster' : 'viewer';

  if (myRole === 'broadcaster') {
    await startLocalAudio();
  }

  socket.emit('join-room', { roomId: myRoomId, role: myRole, userName: myUserId });
  log(`Joined ${myRoomId} as ${myRole} (${myUserId})`);
};

/* leave button */
leaveBtn.onclick = () => {
  if (myRoomId) {
    socket.emit('leave-room', { roomId: myRoomId });
  }
  // cleanup
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  for (const id in pcMap) {
    pcMap[id].close();
  }
  pcMap = {};
  if (viewerPc) {
    viewerPc.close();
    viewerPc = null;
  }
  myRole = null;
  myRoomId = null;
  myUserId = null;
  seatAssign.broadcaster = null;
  seatAssign.viewers = [];
  updateSeatsUI();
  log('Left room');
};

/* toggle mic */
toggleMicBtn.onclick = () => {
  if (!localStream) return alert('No local audio');
  micOn = !micOn;
  localStream.getAudioTracks().forEach(t => t.enabled = micOn);
  toggleMicBtn.textContent = micOn ? '🎤 Toggle Mic (on)' : '🎤 Toggle Mic (off)';
};

///// Socket handlers /////

socket.on('connect', () => log('socket connected: ' + socket.id));

socket.on('viewer-joined', async ({ viewerId, viewerName }) => {
  // broadcaster: create peer connection, add tracks, create offer
  if (!localStream) return;
  const pc = new RTCPeerConnection();
  pcMap[viewerId] = pc;

  pc.onicecandidate = e => {
    if (e.candidate) socket.emit('ice-candidate', { to: viewerId, candidate: e.candidate });
  };

  for (const t of localStream.getTracks()) pc.addTrack(t, localStream);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('offer', { to: viewerId, sdp: pc.localDescription });

  // update seats: broadcaster exists (seat 0)
  seatAssign.broadcaster = { id: socket.id, name: myUserId };
  updateSeatsUI();
});

socket.on('offer', async ({ from, sdp }) => {
  // viewer receives offer
  viewerPc = new RTCPeerConnection();

  viewerPc.ontrack = e => {
    // audio playback
    const aud = document.createElement('audio');
    aud.autoplay = true;
    aud.srcObject = e.streams[0];
    aud.play().catch(()=>{});
    // seat assignment
    seatAssign.broadcaster = { id: from, name: 'Host' };
    updateSeatsUI();
  };

  viewerPc.onicecandidate = e => {
    if (e.candidate) socket.emit('ice-candidate', { to: from, candidate: e.candidate });
  };

  await viewerPc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await viewerPc.createAnswer();
  await viewerPc.setLocalDescription(answer);
  socket.emit('answer', { to: from, sdp: viewerPc.localDescription });
});

socket.on('answer', async ({ from, sdp }) => {
  const pc = pcMap[from];
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
});

socket.on('ice-candidate', async ({ from, candidate }) => {
  try {
    const pc = pcMap[from] || viewerPc;
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch(e){ console.warn(e); }
});

/* simple chat & gifts (optional) */
socket.on('chat-message', (p) => {
  log(`Chat: ${p.from}: ${p.message}`);
});
socket.on('gift', (g) => {
  log(`Gift: ${g.from} sent ${g.giftType}`);
});

/* room-state update */
socket.on('room-state', st => {
  log(`room state: broadcaster=${st.broadcasterId}`);
});
