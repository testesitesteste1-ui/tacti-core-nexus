import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBG7q5w-26tFf6uVDE4q2-ZchQleFVd2IM",
  authDomain: "sorteio-vagas.firebaseapp.com",
  databaseURL: "https://sorteio-vagas-default-rtdb.firebaseio.com",
  projectId: "sorteio-vagas",
  storageBucket: "sorteio-vagas.firebasestorage.app",
  messagingSenderId: "357693024565",
  appId: "1:357693024565:web:fe9b7f21eba8c0ccca047c"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
