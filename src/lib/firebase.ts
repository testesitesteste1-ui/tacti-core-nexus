import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCJKU6gXod3cozCQyTKodI-Tgi5QWM9r-c",
  authDomain: "sexta-feira-a7069.firebaseapp.com",
  databaseURL: "https://sexta-feira-a7069-default-rtdb.firebaseio.com",
  projectId: "sexta-feira-a7069",
  storageBucket: "sexta-feira-a7069.firebasestorage.app",
  messagingSenderId: "349237449964",
  appId: "1:349237449964:web:7ff28774e3580de94d01c9"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);
