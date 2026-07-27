import { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Home from '@/pages/Home';
import CharacterCreation from '@/pages/CharacterCreation';
import CharacterSelectPage from '@/pages/CharacterSelectPage';
import CharacterPage from '@/pages/CharacterPage';
import MissionsPage from '@/pages/MissionsPage';
import GalaxyMapPage from '@/pages/GalaxyMapPage';
import ShipPage from '@/pages/ShipPage';
import ArenaPage from '@/pages/ArenaPage';
import SettingsPage from '@/pages/SettingsPage';
import GuildPage from '@/pages/GuildPage';
import ShopPage from '@/pages/ShopPage';
import CrystalStorePage from '@/pages/CrystalStorePage';
import BlackHolePage from '@/pages/BlackHolePage';
import SpaceMiningPage from '@/pages/SpaceMiningPage';
import CasinoPage from '@/pages/CasinoPage';
import LeaderboardPage from '@/pages/LeaderboardPage';
import NexusPage from '@/pages/NexusPage';
import AchievementsPage from '@/pages/AchievementsPage';
import FriendsPage from '@/pages/FriendsPage';
import MailPage from '@/pages/MailPage';
import MessagesPage from '@/pages/MessagesPage';
import AdminPage from '@/pages/AdminPage';
import GameLayout from '@/components/game/GameLayout';
import SpaceBackground from '@/components/game/SpaceBackground';
import { SiteConfigProvider } from '@/lib/SiteConfigContext';
import EditableText from '@/components/admin/EditableText';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, checkAppState } = useAuth();

  useEffect(() => {
    if (authError?.type === 'auth_required') {
      navigateToLogin();
    }
  }, [authError, navigateToLogin]);

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center stars-bg">
        <div className="text-center">
          <EditableText textKey="app.title" default="LOOT & LASERS" as="h1" className="font-display font-bold text-3xl glow-cyan tracking-widest mb-4" />
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    if (authError.type === 'auth_required') {
      return null;
    }
    if (authError.type === 'unknown') {
      return (
        <div className="fixed inset-0 flex items-center justify-center stars-bg p-4">
          <div className="max-w-md w-full rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-6 text-center">
            <EditableText textKey="app.title" default="LOOT & LASERS" as="h1" className="font-display font-bold text-2xl glow-cyan tracking-widest mb-3" />
            <p className="text-sm text-muted-foreground mb-1">Could not reach the game server.</p>
            <p className="text-xs text-destructive mb-4">{authError.message}</p>
            <Button onClick={checkAppState}>Retry</Button>
          </div>
        </div>
      );
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/" element={<Home />} />
        <Route path="/select-character" element={<CharacterSelectPage />} />
        <Route path="/create-character" element={<CharacterCreation />} />
        <Route element={<GameLayout />}>
          <Route path="/character" element={<CharacterPage />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/galaxy-map" element={<GalaxyMapPage />} />
          <Route path="/ship" element={<ShipPage />} />
          <Route path="/arena" element={<ArenaPage />} />
          <Route path="/guild" element={<GuildPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/crystal-store" element={<CrystalStorePage />} />
          <Route path="/black-hole" element={<BlackHolePage />} />
          <Route path="/space-mining" element={<SpaceMiningPage />} />
          <Route path="/casino" element={<CasinoPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/nexus" element={<NexusPage />} />
          <Route path="/achievements" element={<AchievementsPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/mail" element={<MailPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <SiteConfigProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <SpaceBackground />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </SiteConfigProvider>
    </AuthProvider>
  )
}

export default App