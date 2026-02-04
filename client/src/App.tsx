import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton, useClerk } from "@clerk/clerk-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, LogIn, Loader2, Cloud, Calendar, ImageIcon, Radio, ShoppingCart, MessageSquare, Clock, Mail, StickyNote, Tv, BarChart3 } from "lucide-react";
import { Component, ErrorInfo, ReactNode, useState, useEffect } from "react";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { GlobalRadioPlayer } from "@/components/global-radio-player";
import { AppControlsProvider, AppControlsWidget, HeaderControls } from "@/components/app-controls";

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-8">
      <Card className="max-w-lg w-full">
        <CardContent className="p-12 text-center">
          <div className="w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <Home className="h-10 w-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-muted-foreground mb-6">
            We're having trouble loading the application. Please refresh the page.
          </p>
          <Button onClick={() => window.location.reload()} data-testid="button-retry">
            Refresh Page
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/clock" component={ClockPage} />
      <Route path="/weather" component={WeatherPage} />
      <Route path="/photos" component={PhotosPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/notepad" component={NotepadPage} />
      <Route path="/messages" component={MessagesPage} />
      <Route path="/radio" component={RadioPage} />
      <Route path="/baby-songs" component={BabySongsPage} />
      <Route path="/tv" component={TVPage} />
      <Route path="/shopping" component={ShoppingPage} />
      <Route path="/stocks" component={StocksPage} />
      <Route path="/settings" component={SettingsPage} />
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
                <UserButton afterSignOutUrl="/" />
              </div>
            </header>
            <main className="flex-1 overflow-hidden">
              <Router />
            </main>
          </div>
          <GlobalRadioPlayer />
          <AppControlsWidget />
        </div>
      </SidebarProvider>
    </AppControlsProvider>
  );
}

function LandingPage() {
  const applications = [
    {
      icon: Clock,
      title: "Clock",
      description: "A simple clock to always know the time",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      icon: Cloud,
      title: "Weather",
      description: "Check the weather for you and your family",
      color: "text-sky-500",
      bgColor: "bg-sky-500/10",
    },
    {
      icon: ImageIcon,
      title: "Picture Frame",
      description: "See your favorite photos on screen",
      color: "text-pink-500",
      bgColor: "bg-pink-500/10",
    },
    {
      icon: Calendar,
      title: "Calendar",
      description: "Keep track of birthdays and events",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      icon: StickyNote,
      title: "Notepad",
      description: "Write notes and little reminders",
      color: "text-yellow-600",
      bgColor: "bg-yellow-500/10",
    },
    {
      icon: MessageSquare,
      title: "Messages",
      description: "Send notes to your loved ones",
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
    },
    {
      icon: Radio,
      title: "Radio",
      description: "Listen to Bulgarian radio stations",
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      icon: Tv,
      title: "TV",
      description: "Watch Bulgarian television channels",
      color: "text-red-500",
      bgColor: "bg-red-500/10",
    },
    {
      icon: ShoppingCart,
      title: "Shopping List",
      description: "Remember what you need from the store",
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      icon: BarChart3,
      title: "Stocks",
      description: "See how the market is doing",
      color: "text-indigo-500",
      bgColor: "bg-indigo-500/10",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Header with Sign In */}
      <header className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Home className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold">Family Frame</span>
        </div>
        <SignInButton mode="modal">
          <Button size="lg" data-testid="button-sign-in-header">
            <LogIn className="h-5 w-5 mr-2" />
            Sign In
          </Button>
        </SignInButton>
      </header>

      {/* Welcome Header */}
      <section className="px-6 py-12 md:py-16 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-6">
            <Home className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-3" data-testid="text-landing-title">
            Welcome to Family Frame
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-2">
            A friendly display for your home
          </p>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Everything you need, all in one easy place
          </p>
        </div>
      </section>

      {/* Applications Grid */}
      <section className="flex-1 px-6 pb-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-semibold text-center mb-3">
            Here is what you can do
          </h2>
          <p className="text-muted-foreground text-center mb-10 text-lg">
            Tap any tile after signing in to explore
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
            {applications.map((app, index) => (
              <Card key={index} className="hover-elevate" data-testid={`app-card-${index}`}>
                <CardContent className="flex flex-col items-center justify-center p-6 md:p-8 text-center">
                  <div className={`w-14 h-14 md:w-16 md:h-16 rounded-xl ${app.bgColor} flex items-center justify-center mb-4`}>
                    <app.icon className={`h-7 w-7 md:h-8 md:w-8 ${app.color}`} />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">{app.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {app.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Sign In Section */}
      <section className="py-12 px-6 bg-muted/30">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl md:text-2xl font-semibold mb-3">
            Ready to get started?
          </h2>
          <p className="text-muted-foreground mb-6">
            Sign in to set up your own Family Frame
          </p>
          <SignInButton mode="modal">
            <Button size="lg" className="text-lg px-8" data-testid="button-sign-in">
              <LogIn className="h-5 w-5 mr-2" />
              Sign In
            </Button>
          </SignInButton>
          <p className="text-sm text-muted-foreground mt-4">
            Free to use. No payment needed.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Home className="h-4 w-4" />
            <span>Family Frame</span>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <a 
              href="/privacy" 
              className="hover:text-foreground transition-colors" 
              data-testid="link-privacy"
            >
              Privacy Policy
            </a>
            <a 
              href="/terms" 
              className="hover:text-foreground transition-colors" 
              data-testid="link-terms"
            >
              Terms of Service
            </a>
            <a 
              href="mailto:support@familyframe.app" 
              className="hover:text-foreground transition-colors flex items-center gap-1" 
              data-testid="link-support"
            >
              <Mail className="h-3.5 w-3.5" />
              Support
            </a>
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date().getFullYear()} Family Frame
          </div>
        </div>
      </footer>
    </div>
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
      <SignedIn>
        <AuthenticatedLayout />
      </SignedIn>
      <SignedOut>
        <LandingPage />
      </SignedOut>
    </>
  );
}

export default App;
