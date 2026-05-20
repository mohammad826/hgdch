/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { Home as HomeIcon, CheckSquare, Users } from 'lucide-react';
import Home from './views/Home';
import Tasks from './views/Tasks';
import Friends from './views/Friends';
import { UserData, TabType } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [userId, setUserId] = useState<string>('debug_user_123'); // fallback for web
  const [userData, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    // Initialize Telegram Web App
    if (WebApp.initDataUnsafe?.user?.id) {
      setUserId(WebApp.initDataUnsafe.user.id.toString());
      WebApp.expand();
      WebApp.ready();
    }
  }, []);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await fetch(`/api/user/${userId}`);
        const data = await response.json();
        setUserData(data);
      } catch (err) {
        console.error("Failed to fetch user data:", err);
      }
    };

    fetchUserData();
  }, [userId]);

  const handleReward = (amount: number, taskId?: string) => {
    setUserData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        balance: prev.balance + amount,
        tasksCompleted: taskId ? [...prev.tasksCompleted, taskId] : prev.tasksCompleted
      };
    });
  };

  return (
    <div 
      className="flex flex-col h-screen w-full text-white overflow-hidden sm:max-w-md sm:mx-auto sm:border-x sm:border-white/10 select-none shadow-2xl" 
      dir="rtl"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
    >
      
      {/* Header */ }
      <header className="px-6 py-5 flex items-center justify-between backdrop-blur-md bg-white/5 border-b border-white/10 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-400 to-purple-600 p-[2px]">
            <div className="w-full h-full rounded-full bg-[#1a1a2e] flex items-center justify-center text-xs font-bold text-white">ID</div>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">Adsgram App</h1>
            <p className="text-[10px] text-cyan-400 font-mono flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {userId.substring(0, 12)}
            </p>
          </div>
        </div>
      </header>

      {/* Main Content Area */ }
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {activeTab === 'home' && (
          <Home userId={userId} userData={userData} onReward={handleReward} />
        )}
        {activeTab === 'tasks' && (
          <Tasks userId={userId} userData={userData} onReward={handleReward} />
        )}
        {activeTab === 'friends' && (
          <Friends userId={userId} />
        )}
      </main>

      {/* Bottom Navigation Navbar */ }
      <nav className="h-20 backdrop-blur-2xl bg-black/40 border-t border-white/10 px-6 py-2 pb-safe">
        <div className="flex justify-around items-center h-full">
          <button 
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'home' ? 'text-cyan-400' : 'text-white/50'}`}
          >
            <HomeIcon className="w-6 h-6" />
            <span className={`text-[10px] ${activeTab === 'home' ? 'font-bold' : ''}`}>خانه</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('tasks')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'tasks' ? 'text-cyan-400' : 'text-white/50'}`}
          >
            <CheckSquare className="w-6 h-6" />
            <span className={`text-[10px] ${activeTab === 'tasks' ? 'font-bold' : ''}`}>تسک ها</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('friends')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'friends' ? 'text-cyan-400' : 'text-white/50'}`}
          >
            <Users className="w-6 h-6" />
            <span className={`text-[10px] ${activeTab === 'friends' ? 'font-bold' : ''}`}>دوستان</span>
          </button>
        </div>
      </nav>

    </div>
  );
}
