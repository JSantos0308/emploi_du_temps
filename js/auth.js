import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, deleteDoc, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyADndGQPP7OjP0pK1wqfeZrdZQ84_iLrys",
  authDomain: "emploi-du-temps-2ffd6.firebaseapp.com",
  projectId: "emploi-du-temps-2ffd6",
  storageBucket: "emploi-du-temps-2ffd6.firebasestorage.app",
  messagingSenderId: "897752698709",
  appId: "1:897752698709:web:a1ac2f8be097f3ad6a69dc"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
try { enableIndexedDbPersistence(db); } catch (e) { }

window.__auth = auth;
window.__fs = { doc, setDoc, getDoc, deleteDoc, db };

let isSignUpMode = false;

function setAuthMsg(text, kind) {
  const el = document.getElementById('authMsg');
  el.textContent = text || '';
  el.className = 'auth-msg' + (kind ? ' ' + kind : '');
}

function translateAuthError(code) {
  const map = {
    'auth/invalid-email': "Adresse e-mail invalide.",
    'auth/user-not-found': "Aucun compte avec cette adresse.",
    'auth/wrong-password': "Mot de passe incorrect.",
    'auth/invalid-credential': "Identifiants incorrects.",
    'auth/email-already-in-use': "Un compte existe déjà avec cette adresse.",
    'auth/weak-password': "Mot de passe trop court (6 caractères minimum).",
    'auth/too-many-requests': "Trop de tentatives, réessayez plus tard.",
    'auth/network-request-failed': "Pas de connexion internet."
  };
  return map[code] || "Une erreur est survenue.";
}

document.getElementById('switchText').addEventListener('click', () => {
  isSignUpMode = !isSignUpMode;
  document.getElementById('authTitle').textContent = isSignUpMode ? "Créer un compte" : "Connexion";
  document.getElementById('btnAuth').textContent = isSignUpMode ? "S'inscrire" : "Se connecter";
  document.getElementById('switchText').textContent = isSignUpMode ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? S'inscrire";
  setAuthMsg('');
});

document.getElementById('btnAuth').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  setAuthMsg('');
  if (!email || !password) { setAuthMsg("Indiquez une adresse e-mail et un mot de passe.", 'error'); return; }
  try {
    if (isSignUpMode) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      sendEmailVerification(cred.user).catch(() => {});
      setAuthMsg("Compte créé. Un e-mail de vérification vous a été envoyé.", 'ok');
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (e) {
    setAuthMsg(translateAuthError(e.code), 'error');
  }
});

document.getElementById('btnForgot').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  if (!email) { setAuthMsg("Indiquez votre adresse e-mail ci-dessus, puis cliquez à nouveau.", 'error'); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    setAuthMsg("E-mail de réinitialisation envoyé.", 'ok');
  } catch (e) {
    setAuthMsg(translateAuthError(e.code), 'error');
  }
});

document.getElementById('btnSkip').addEventListener('click', () => {
  document.getElementById('authOverlay').style.display = 'none';
  window.dispatchEvent(new CustomEvent('app:offline-mode'));
});

document.getElementById('btnLogout').addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('app:before-logout'));
  signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  const overlay = document.getElementById('authOverlay');
  if (user && !user.isAnonymous) {
    overlay.style.display = 'none';
    window.dispatchEvent(new CustomEvent('app:signed-in', { detail: { uid: user.uid, email: user.email } }));
  } else {
    window.dispatchEvent(new CustomEvent('app:signed-out'));
    if (!window.__offlineChoice) overlay.style.display = 'flex';
  }
});
