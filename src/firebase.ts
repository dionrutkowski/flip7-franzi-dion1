import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDNYWm8BLO5F_RLeYRRBRn8c_y_9X1zyJw",
  authDomain: "flip7-d0196.firebaseapp.com",
  projectId: "flip7-d0196",
  storageBucket: "flip7-d0196.firebasestorage.app",
  messagingSenderId: "32100067713",
  appId: "1:32100067713:web:8969aea78931e22e86e080",
  measurementId: "G-N8NW1L1SQ6"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);