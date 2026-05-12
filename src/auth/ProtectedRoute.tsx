import React from 'react';
import { useAuth } from './AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, fallback }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return null; // The loading UI is handled in App.tsx
  }

  if (!user) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};