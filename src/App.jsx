import { useEffect, lazy, Suspense } from 'react';
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
import GameLayout from '@/components/game/GameLayout';
import SoundtrackController from '@/components/game/SoundtrackController';
import SpaceBackground from '@/components/game/SpaceBackground';
import { SiteConfigProvider } from '@/lib/SiteConfigContext';
import SiteTitle from '@/components/admin/SiteTitle';

// Auth shell stays eager — first paint should not wait on game pages.
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

const CharacterSelectPage = lazy(() => import('@/pages/CharacterSelectPage'));
const CharacterCreation = lazy(() => import('@/pages/CharacterCreation'));
const Home = lazy(() => import('@/pages/Home'));
const CharacterPage = lazy(() => import('@/pages/CharacterPage'));
const MissionsPage = lazy(() => import('@/pages/MissionsPage'));
const GalaxyMapPage = lazy(() => import('@/pages/GalaxyMapPage'));
const ShipPage = lazy(() => import('@/pages/ShipPage'));
const ArenaPage = lazy(() => import('@/pages/ArenaPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const GuildPage = lazy(() => import('@/pages/GuildPage'));
const ShopPage = lazy(() => import('@/pages/ShopPage'));
const CrystalStorePage = lazy(() => import('@/pages/CrystalStorePage'));
const BlackHolePage = lazy(() => import('@/pages/BlackHolePage'));
const SpaceMiningPage = lazy(() => import('@/pages/SpaceMiningPage'));
const CasinoPage = lazy(() => import('@/pages/CasinoPage'));
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage'));
const NexusPage = lazy(() => import('@/pages/NexusPage'));
const AchievementsPage = lazy(() => import('@/pages/AchievementsPage'));
const FriendsPage = lazy(() => import('@/pages/FriendsPage'));
const MailPage = lazy(() => import('@/pages/MailPage'));
const MessagesPage = lazy(() => import('@/pages/MessagesPage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));

function RouteFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center stars-bg">
      <div className="text-center">
        <SiteTitle as="h1" className="font-display font-bold text-3xl glow-cyan tracking-widest mb-4" />
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto" />
      </div>
    </div>
  );
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, checkAppState } = useAuth();

  useEffect(() => {
    if (authError?.type === 'auth_required') {
      navigateToLogin();
    }
  }, [authError, navigateToLogin]);

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <RouteFallback />;
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
            <SiteTitle as="h1" className="font-display font-bold text-2xl glow-cyan tracking-widest mb-3" />
            <p className="text-sm text-muted-foreground mb-1">Could not reach the game server.</p>
            <p className="text-xs text-destructive mb-4">{authError.message}</p>
            <Button onClick={checkAppState}>Retry</Button>
          </div>
        </div>
      );
    }
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route path="/select-character" element={<CharacterSelectPage />} />
          <Route path="/create-character" element={<CharacterCreation />} />
          <Route element={<GameLayout />}>
            <Route path="/" element={<Home />} />
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
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <SiteConfigProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <SoundtrackController />
            <SpaceBackground fixed />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </SiteConfigProvider>
    </AuthProvider>
  )
}

export default App
