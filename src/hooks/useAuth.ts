import { useCallback } from 'react';
import { useApp } from '../context/AppContext';

export function useAuth() {
  const { state, login, devLogin, logout } = useApp();

  const handleLogin = useCallback(async () => {
    return await login();
  }, [login]);

  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  return {
    isAuthenticated: state.auth.isAuthenticated,
    isLoading: state.auth.isLoading,
    user: state.auth.user,
    login: handleLogin,
    devLogin,
    logout: handleLogout,
  };
}
