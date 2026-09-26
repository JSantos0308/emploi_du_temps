import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  signOut, onAuthStateChanged, sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Votre configuration Firebase exacte
const firebaseConfig = {
  apiKey: "AIzaSyADndGQPP7OjP0pK1wqfeZrdZQ84_iLrys",
  authDomain: "emploi-du-temps-2ffd6.firebaseapp.com",
  projectId: "emploi-du-temps-2ffd6",
  storageBucket: "emploi-du-temps-2ffd6.firebasestorage.app",
  messagingSenderId: "897752698709",
  appId: "1:897752698709:web:a1ac2f8be097f3ad6a69dc",
  measurementId: "G-NX917W181S"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

window.__auth = auth;
window.__fs = { db, doc, getDoc, setDoc };

const $ = (id) => document.getElementById(id);
let isSignUp = false;

$('switchText').addEventListener('click', () => {
  isSignUp = !isSignUp;
  $('authTitle').textContent = isSignUp ? "Inscription" : "Connexion";
  $('btnAuth').textContent = isSignUp ? "S'inscrire" : "Se connecter";
  $('switchText').textContent = isSignUp ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? S'inscrire";
});

$('btnAuth').addEventListener('click', async () => {
  const email = $('email').value.trim();
  const password = $('password').value;
  const msg = $('authMsg');
  msg.textContent = "";
  msg.className = "auth-msg";

  if (!email || !password) {
    msg.textContent = "Veuillez remplir tous les champs.";
    msg.className = "auth-msg error";
    return;
  }

  try {
    if (isSignUp) {
      await createUserWithEmailAndPassword(auth, email, password);
      msg.textContent = "Compte créé avec succès !";
      msg.className = "auth-msg ok";
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "auth-msg error";
  }
});

$('btnForgot').addEventListener('click', async () => {
  const email = $('email').value.trim();
  const msg = $('authMsg');
  if (!email) {
    msg.textContent = "Entrez votre e-mail pour réinitialiser le mot de passe.";
    msg.className = "auth-msg error";
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    msg.textContent = "E-mail de réinitialisation envoyé.";
    msg.className = "auth-msg ok";
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "auth-msg error";
  }
});

$('btnSkip').addEventListener('click', () => {
  $('authOverlay').style.display = 'none';
  window.dispatchEvent(new CustomEvent('app:offline-mode'));
});

$('btnLogout').addEventListener('click', async () => {
  window.dispatchEvent(new CustomEvent('app:before-logout'));
  try { await signOut(auth); } catch(e) {}
  $('authOverlay').style.display = 'flex';
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    $('authOverlay').style.display = 'none';
    window.dispatchEvent(new CustomEvent('app:signed-in', { detail: { uid: user.uid } }));
  }
});
