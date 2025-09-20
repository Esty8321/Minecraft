import React from 'react';
import { User, LogOut, Shield, Calendar, Mail } from 'lucide-react';
import { User as UserType } from '../types/auth';

interface DashboardProps {
  user: UserType;
  token: string;
  onLogout: () => void;
}

export default function Dashboard({ user, token, onLogout }: DashboardProps) {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getTokenPayload = () => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload;
    } catch {
      return null;
    }
  };

  const tokenPayload = getTokenPayload();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <User className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">Welcome back, {user.username}!</h1>
                  <p className="text-gray-600">You're successfully authenticated</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="flex items-center space-x-2 bg-red-100 hover:bg-red-200 text-red-700 font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span>Logout</span>
              </button>
            </div>
          </div>

          {/* User Information */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-800">User Profile</h2>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600">User ID</label>
                  <p className="text-lg text-gray-800">{user.id}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Username</label>
                  <p className="text-lg text-gray-800">{user.username}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-800">{user.email}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-green-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-800">Authentication Status</h2>
              </div>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-green-700 font-medium">Authenticated</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Token Status</label>
                  <p className="text-green-700 font-medium">Valid & Active</p>
                </div>
                {tokenPayload && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Expires</label>
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-800">{formatDate(tokenPayload.exp)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Token Information */}
          {tokenPayload && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">JWT Token Details</h2>
              <div className="bg-gray-50 rounded-lg p-4 border">
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="block font-medium text-gray-600">Subject (User ID)</label>
                    <p className="text-gray-800">{tokenPayload.sub}</p>
                  </div>
                  <div>
                    <label className="block font-medium text-gray-600">Username</label>
                    <p className="text-gray-800">{tokenPayload.username}</p>
                  </div>
                  <div>
                    <label className="block font-medium text-gray-600">Issued At</label>
                    <p className="text-gray-800">{formatDate(tokenPayload.iat)}</p>
                  </div>
                  <div>
                    <label className="block font-medium text-gray-600">Expires At</label>
                    <p className="text-gray-800">{formatDate(tokenPayload.exp)}</p>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <label className="block font-medium text-gray-600 mb-2">Raw Token (First 100 chars)</label>
                <div className="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-xs overflow-hidden">
                  {token.substring(0, 100)}...
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}