import './style.css';

// Import Firebase modules
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDoc, addDoc, onSnapshot } from "firebase/firestore";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBD5GoLZyhICzvrP2Kn9bxFEI-oK8ez3fc",
  authDomain: "video-call-c7030.firebaseapp.com",
  projectId: "video-call-c7030",
  storageBucket: "video-call-c7030.appspot.com",
  messagingSenderId: "894979492610",
  appId: "1:894979492610:web:5227cf833f11471106901b",
  measurementId: "G-VHDB03MN01"
};

// Initialize Firebase and Firestore
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

// ICE Servers configuration
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// 1. Setup media sources
webcamButton.onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    remoteStream = new MediaStream();

    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Pull tracks from remote stream, add to video stream
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    };

    webcamVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;

    callButton.disabled = false;
    answerButton.disabled = false;
    webcamButton.disabled = true;
  } catch (error) {
    console.error("Error accessing media devices:", error);
    alert("Could not access webcam or microphone. Please check your permissions.");
  }
};

// 2. Create an offer
callButton.onclick = async () => {
  try {
    const callDoc = doc(collection(firestore, 'calls'));
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    callInput.value = callDoc.id;

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          await addDoc(offerCandidates, event.candidate.toJSON());
        } catch (e) {
          console.error("Failed to add offer candidate:", e);
        }
      }
    };

    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };

    await setDoc(callDoc, { offer });

    onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
      }
    });

    onSnapshot(answerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    hangupButton.disabled = false;
  } catch (error) {
    console.error("Error creating offer:", error);
    alert("Failed to create a call. Please check your Firestore rules and configuration.");
  }
};

// 3. Answer the call
answerButton.onclick = async () => {
  try {
    const callId = callInput.value.trim();
    if (!callId) {
      alert("Please enter a valid call ID.");
      return;
    }

    const callDoc = doc(firestore, 'calls', callId);
    const answerCandidates = collection(callDoc, 'answerCandidates');
    const offerCandidates = collection(callDoc, 'offerCandidates');

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          await addDoc(answerCandidates, event.candidate.toJSON());
        } catch (e) {
          console.error("Failed to add answer candidate:", e);
        }
      }
    };

    const callData = (await getDoc(callDoc)).data();
    if (!callData?.offer) {
      alert("No offer found for this call ID.");
      return;
    }

    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await setDoc(callDoc, { answer }, { merge: true });

    onSnapshot(offerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  } catch (error) {
    console.error("Error answering call:", error);
    alert("Failed to answer the call. Please check the call ID and try again.");
  }
};

// Debugging Firestore Permissions
const callsRef = collection(firestore, 'calls');
getDocs(callsRef)
  .then(() => console.log('Permissions are set correctly.'))
  .catch((e) => console.error('Permissions issue:', e));
