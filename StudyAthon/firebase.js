// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA6GrPLlniatwZxVMm1SEZBF0qegHgITJU",
  authDomain: "studyathon-5d4f7.firebaseapp.com",
  projectId: "studyathon-5d4f7",
  storageBucket: "studyathon-5d4f7.firebasestorage.app",
  messagingSenderId: "26303116025",
  appId: "1:26303116025:web:fd671f0c3a70b3c7a5a828",
  measurementId: "G-5LBWB4L49N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);