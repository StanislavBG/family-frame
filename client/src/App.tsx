import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { ClerkProvider, Show, UserButton, useClerk } from "@clerk/react";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home";
import WeatherPage from "@/pages/weather";
import PhotosPage from "@/pages/photos";
import CalendarPage from "@/pages/calendar";
import NotepadPage from "@/pages/notepad";
import MessagesPage from "@/pages/messages";
import RadioPage from "@/pages/radio";
import BabySongsPage from "@/pages/baby-songs";
import TVPage from "@/pages/tv";
import ShoppingPage from "@/pages/shopping";
import SettingsPage from "@/pages/settings";
import ClockPage from "@/pages/clock";
import StocksPage from "@/pages/stocks";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import ChoresPage from "@/pages/chores";
import RecipesPage from "@/pages/recipes";
import ScreensaverPage from "@/pages/screensaver";
import PeoplePage from "@/pages/people";
import EventsPage from "@/pages/events";
import LandingPage from "@/pages/landing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, Loader2 } from "lucide-react";
import { Component, ErrorInfo, ReactNode, useState, useEffect, useCallback } from "react";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { APP_MANIFESTS, type AppId } from "@shared/apps";
import { withAppGate } from "@/components/app-gate";
import { AppControlsProvider, AppControlsWidget, HeaderControls, useAppControls } from "@/components/app-controls";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Per-route error boundary that auto-recovers by navigating home
interface RouteErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error) => void;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[RouteError]", error.message, errorInfo.componentStack);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return <RouteErrorRecovery error={this.state.error} onReset={() => this.setState({ hasError: false, error: null })} />;
    }
    return this.props.children;
  }
}

function RouteErrorRecovery({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const [, navigate] = useLocation();

  // Already on Home: redirecting home would just re-crash in a loop
  const onHome = window.location.pathname === "/";

  useEffect(() => {
    if (onHome) return;
    // Auto-navigate home after a short delay so the user sees the message
    const timer = setTimeout(() => {
      onReset();
      navigate("/");
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigate, onReset, onHome]);

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <p className="text-lg font-medium mb-1">This page hit an error</p>
        <p className="text-sm text-muted-foreground mb-4">
          {error?.message || "Unknown error"}{onHome ? "" : " — redirecting home..."}
        </p>
        {onHome ? (
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => { onReset(); navigate("/"); }}>
            Go Home Now
          </Button>
        )}
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-8">
      <Card className="max-w-lg w-full">
        <CardContent className="p-12 text-center">
          <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-6">
            <Home className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Family Frame</h1>
          <p className="text-lg text-muted-foreground mb-6">The Window Between Homes</p>
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading...</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center">
        <p className="text-lg font-medium mb-2">Unable to load Family Frame</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      </div>
    </div>
  );
}

// Wrap a page component in a per-route error boundary that reports to debug log
function guarded(PageComponent: React.ComponentType) {
  return function GuardedRoute() {
    const { addDebugLog } = useAppControls();
    const handleError = useCallback((error: Error) => {
      addDebugLog("error", "Page crash", error.message);
    }, [addDebugLog]);
    return (
      <RouteErrorBoundary onError={handleError}>
        <PageComponent />
      </RouteErrorBoundary>
    );
  };
}

// Created once at module scope so component identity stays stable across renders
const GuardedHome = guarded(HomePage);
const GuardedClock = guarded(ClockPage);
const GuardedWeather = guarded(WeatherPage);
const GuardedPhotos = guarded(PhotosPage);
const GuardedCalendar = guarded(CalendarPage);
const GuardedEvents = guarded(EventsPage);
const GuardedPeople = guarded(PeoplePage);
const GuardedChores = guarded(ChoresPage);
const GuardedRecipes = guarded(RecipesPage);
const GuardedNotepad = guarded(NotepadPage);
const GuardedMessages = guarded(MessagesPage);
const GuardedRadio = guarded(RadioPage);
const GuardedBabySongs = guarded(BabySongsPage);
const GuardedTV = guarded(TVPage);
const GuardedShopping = guarded(ShoppingPage);
const GuardedStocks = guarded(StocksPage);
const GuardedScreensaver = guarded(ScreensaverPage);
const GuardedSettings = guarded(SettingsPage);

const APP_PAGES: Record<AppId, React.ComponentType> = {
  home: GuardedHome,
  settings: GuardedSettings,
  clock: GuardedClock,
  weather: GuardedWeather,
  photos: GuardedPhotos,
  calendar: GuardedCalendar,
  events: GuardedEvents,
  people: GuardedPeople,
  chores: GuardedChores,
  recipes: GuardedRecipes,
  notepad: GuardedNotepad,
  messages: GuardedMessages,
  radio: GuardedRadio,
  "baby-songs": GuardedBabySongs,
  tv: GuardedTV,
  shopping: GuardedShopping,
  stocks: GuardedStocks,
  screensaver: GuardedScreensaver,
};

// Built once at module scope: gated components must keep a stable identity across renders
const APP_ROUTES = APP_MANIFESTS.map((app) => {
  const Page = app.fixed ? APP_PAGES[app.id] : withAppGate(app.id, APP_PAGES[app.id]);
  return (
    <Route key={app.id} path={app.url} nest={!!app.nested}>
      <Page />
    </Route>
  );
});

function Router() {
  return (
    <Switch>
      {APP_ROUTES}
      <Route component={NotFound} />
    </Switch>
  );
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  useWakeLock();

  return (
    <AppControlsProvider>
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex h-screen w-full overflow-hidden">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="flex items-center justify-between h-14 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-2">
                <HeaderControls />
                <ThemeToggle />
                <UserButton />
              </div>
            </header>
            <main className="flex-1 overflow-hidden">
              <Router />
            </main>
          </div>
          <AppControlsWidget />
        </div>
      </SidebarProvider>
    </AppControlsProvider>
  );
}


function App() {
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [configError, setConfigError] = useState(false);

  useEffect(() => {
    // Try Vite env var first (works in development with proper VITE_ prefix)
    const viteKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
    if (viteKey) {
      setPublishableKey(viteKey);
      return;
    }

    // Fallback: fetch from server (handles production with non-VITE prefixed secrets)
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.clerkPublishableKey) {
          setPublishableKey(data.clerkPublishableKey);
        } else {
          setConfigError(true);
        }
      })
      .catch(() => {
        setConfigError(true);
      });
  }, []);

  if (configError) {
    return (
      <ThemeProvider defaultTheme="light" storageKey="family-frame-theme">
        <div className="min-h-screen flex items-center justify-center p-8">
          <Card className="max-w-md">
            <CardContent className="p-8 text-center">
              <h2 className="text-xl font-semibold mb-2">Configuration Required</h2>
              <p className="text-muted-foreground">
                Please add VITE_CLERK_PUBLISHABLE_KEY to your environment variables.
              </p>
            </CardContent>
          </Card>
        </div>
      </ThemeProvider>
    );
  }

  if (!publishableKey) {
    return (
      <ThemeProvider defaultTheme="light" storageKey="family-frame-theme">
        <LoadingScreen />
      </ThemeProvider>
    );
  }

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <ClerkProvider 
        publishableKey={publishableKey}
        signInFallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/"
        afterSignOutUrl="/"
        allowedRedirectOrigins={[
          currentOrigin,
          /https:\/\/.*\.replit\.dev$/,
          /https:\/\/.*\.replit\.app$/,
        ]}
      >
        <ThemeProvider defaultTheme="light" storageKey="family-frame-theme">
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <ClerkContent />
              <Toaster />
            </TooltipProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </ClerkProvider>
    </ErrorBoundary>
  );
}

function ClerkContent() {
  const { loaded } = useClerk();
  const [timedOut, setTimedOut] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loaded) {
        setTimedOut(true);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [loaded]);

  const isPublicRoute = location === "/privacy" || location === "/terms";
  
  if (isPublicRoute) {
    return <PublicRouter />;
  }

  if (!loaded && !timedOut) {
    return <LoadingScreen />;
  }

  if (timedOut && !loaded) {
    const isInIframe = window.self !== window.top;
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-8">
        <Card className="max-w-lg w-full">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-6">
              <Home className="h-10 w-10 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Family Frame</h1>
            <p className="text-lg text-muted-foreground mb-2">The Window Between Homes</p>
            {isInIframe ? (
              <>
                <p className="text-muted-foreground mb-6">
                  For the best experience, open the app in a new browser tab.
                </p>
                <div className="flex flex-col gap-3">
                  <Button 
                    onClick={() => window.open(window.location.href, '_blank')} 
                    data-testid="button-open-new-tab"
                  >
                    Open in New Tab
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => window.location.reload()} 
                    data-testid="button-retry-auth"
                  >
                    Try Again Here
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground mb-6">
                  We're having trouble connecting to the authentication service.
                </p>
                <Button onClick={() => window.location.reload()} data-testid="button-retry-auth">
                  Try Again
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <Show when="signed-in">
        <AuthenticatedLayout />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

export default App;
