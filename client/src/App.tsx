// import React, { useState, useEffect } from 'react';
// import { CheckCircle, AlertCircle, Wifi, WifiOff } from 'lucide-react';
// import LoginForm from './components/LoginForm';
// import RegisterForm from './components/RegisterForm';
// import Dashboard from './components/Dashboard';
// import VoxelGrid from './components/VoxelGrid.tsx';
// import { authStorage } from './utils/auth';
// import { authApi } from './utils/api';
// import { User } from './types/auth';

// type View = 'login' | 'register' | 'dashboard';

// function App() {
//   const [currentView, setCurrentView] = useState<View>('login');
//   const [user, setUser] = useState<User | null>(null);
//   const [token, setToken] = useState<string | null>(null);
//   const [notification, setNotification] = useState<{
//     type: 'success' | 'error';
//     message: string;
//   } | null>(null);
//   const [isOnline, setIsOnline] = useState(true);

//   // Check if user is already authenticated on app load
//   useEffect(() => {
//     const savedUser = authStorage.getUser();
//     const savedToken = authStorage.getToken();
    
//     if (savedUser && savedToken) {
//       setUser(savedUser);
//       setToken(savedToken);
//       setCurrentView('dashboard');
//     }
//   }, []);

//   // Check API health status
//   useEffect(() => {
//     const checkHealth = async () => {
//       try {
//         await authApi.health();
//         setIsOnline(true);
//       } catch {
//         setIsOnline(false);
//       }
//     };

//     checkHealth();
//     const interval = setInterval(checkHealth, 30000); // Check every 30 seconds
//     return () => clearInterval(interval);
//   }, []);

//   const showNotification = (type: 'success' | 'error', message: string) => {
//     setNotification({ type, message });
//     setTimeout(() => setNotification(null), 5000);
//   };

//   const handleLoginSuccess = (userData: User, authToken: string) => {
//     setUser(userData);
//     setToken(authToken);
//     authStorage.setUser(userData);
//     authStorage.setToken(authToken);
//     setCurrentView('dashboard');
//     showNotification('success', `Welcome back, ${userData.username}!`);
//   };

//   const handleRegisterSuccess = (userData: User) => {
//     showNotification('success', `Account created successfully! Welcome, ${userData.username}!`);
//     setCurrentView('login');
//   };

//   const handleLogout = () => {
//     setUser(null);
//     setToken(null);
//     authStorage.clear();
//     setCurrentView('login');
//     showNotification('success', 'Successfully logged out');
//   };

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
//       {/* Status Bar */}
//       <div className="fixed top-4 right-4 z-50">
//         <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium ${
//           isOnline 
//             ? 'bg-green-100 text-green-700 border border-green-200' 
//             : 'bg-red-100 text-red-700 border border-red-200'
//         }`}>
//           {isOnline ? (
//             <>
//               <Wifi className="w-4 h-4" />
//               <span>API Online</span>
//             </>
//           ) : (
//             <>
//               <WifiOff className="w-4 h-4" />
//               <span>API Offline</span>
//             </>
//           )}
//         </div>
//       </div>

//       {/* Notification */}
//       {notification && (
//         <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-top-2 duration-300">
//           <div className={`flex items-center space-x-2 px-4 py-3 rounded-lg shadow-lg border ${
//             notification.type === 'success'
//               ? 'bg-green-100 text-green-700 border-green-200'
//               : 'bg-red-100 text-red-700 border-red-200'
//           }`}>
//             {notification.type === 'success' ? (
//               <CheckCircle className="w-5 h-5" />
//             ) : (
//               <AlertCircle className="w-5 h-5" />
//             )}
//             <span className="font-medium">{notification.message}</span>
//           </div>
//         </div>
//       )}

//       {/* Main Content */}
//       {currentView === 'dashboard' ? (
//         <div className="flex flex-col items-center justify-center min-h-screen">
//           <Dashboard 
//             user={user!} 
//             token={token!} 
//             onLogout={handleLogout}
//           />
//           {/* Show VoxelGrid below Dashboard */}
//           <div className="mt-8 w-full max-w-4xl">
//             <VoxelGrid />
//           </div>
//         </div>
//       ) : (
//         <div className="min-h-screen flex items-center justify-center px-4 py-8">
//           <div className="w-full max-w-md">
//             {/* Decorative Background */}
//             <div className="absolute inset-0 -z-10 overflow-hidden">
//               <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-200 rounded-full blur-3xl opacity-20"></div>
//               <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-200 rounded-full blur-3xl opacity-20"></div>
//             </div>

//             {/* Auth Card */}
//             <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-white/50 p-8">
//               {currentView === 'login' ? (
//                 <LoginForm
//                   onSuccess={handleLoginSuccess}
//                   onSwitchToRegister={() => setCurrentView('register')}
//                 />
//               ) : (
//                 <RegisterForm
//                   onSuccess={handleRegisterSuccess}
//                   onSwitchToLogin={() => setCurrentView('login')}
//                 />
//               )}
//             </div>

//             {/* Footer */}
//             <div className="text-center mt-8">
//               <p className="text-sm text-gray-500">
//                 Secure authentication powered by FastAPI & JWT
//               </p>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// export default App;


import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import { authStorage } from "./utils/auth";
import LoginForm from "./components/LoginForm";
import RegisterForm from "./components/RegisterForm";
import GamePage from "./components/VoxelGrid";
import TopBar from "./components/TopBar";

function PrivateRoute({ children }: { children: JSX.Element }) {
  const isAuthed = authStorage.isAuthenticated();
  return isAuthed ? children : <Navigate to="/auth" replace />;
}

function AuthPage() {
  if (authStorage.isAuthenticated()) return <Navigate to="/game" replace />;

  const [tab, setTab] = useState<"login" | "register">("login"); // 👈 ברירת מחדל: Login

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Welcome</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          className={`px-3 py-1.5 rounded ${tab === "login" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setTab("login")}
        >
          Sign In
        </button>
        <button
          className={`px-3 py-1.5 rounded ${tab === "register" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setTab("register")}
        >
          Create Account
        </button>
      </div>

      {tab === "login" ? (
        <LoginForm onDone={() => (window.location.href = "/game")} />
      ) : (
        <RegisterForm onDone={() => (window.location.href = "/game")} />
      )}
    </div>
  );
}

export default function App() {
  const isAuthed = authStorage.isAuthenticated();

  return (
    <BrowserRouter>
      <TopBar />
      <Routes>
        <Route path="/" element={<Navigate to={isAuthed ? "/game" : "/auth"} replace />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/game"
          element={
            <PrivateRoute>
              <GamePage />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
