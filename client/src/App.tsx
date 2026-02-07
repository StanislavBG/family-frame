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
import ChoresPage from "@/pages/chores";
import RecipesPage from "@/pages/recipes";
import ScreensaverPage from "@/pages/screensaver";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, LogIn, Loader2, Cloud, Calendar, ImageIcon, Radio, ShoppingCart, MessageSquare, Clock, Mail, StickyNote, Tv, BarChart3 } from "lucide-react";
import { Component, ErrorInfo, ReactNode, useState, useEffect, useMemo, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useWakeLock } from "@/hooks/use-wake-lock";
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

  useEffect(() => {
    // Auto-navigate home after a short delay so the user sees the message
    const timer = setTimeout(() => {
      onReset();
      navigate("/");
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigate, onReset]);

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <p className="text-lg font-medium mb-1">This page hit an error</p>
        <p className="text-sm text-muted-foreground mb-4">
          {error?.message || "Unknown error"} — redirecting home...
        </p>
        <Button variant="outline" size="sm" onClick={() => { onReset(); navigate("/"); }}>
          Go Home Now
        </Button>
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={guarded(HomePage)} />
      <Route path="/clock" component={guarded(ClockPage)} />
      <Route path="/weather" component={guarded(WeatherPage)} />
      <Route path="/photos" component={guarded(PhotosPage)} />
      <Route path="/calendar" component={guarded(CalendarPage)} />
      <Route path="/chores" component={guarded(ChoresPage)} />
      <Route path="/recipes" component={guarded(RecipesPage)} />
      <Route path="/notepad" component={guarded(NotepadPage)} />
      <Route path="/messages" component={guarded(MessagesPage)} />
      <Route path="/radio" component={guarded(RadioPage)} />
      <Route path="/baby-songs" component={guarded(BabySongsPage)} />
      <Route path="/tv" component={guarded(TVPage)} />
      <Route path="/shopping" component={guarded(ShoppingPage)} />
      <Route path="/stocks" component={guarded(StocksPage)} />
      <Route path="/screensaver" component={guarded(ScreensaverPage)} />
      <Route path="/settings" component={guarded(SettingsPage)} />
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
          <AppControlsWidget />
        </div>
      </SidebarProvider>
    </AppControlsProvider>
  );
}

function LandingPage() {
  const prefersReducedMotion = useReducedMotion();
  const [activeFeature, setActiveFeature] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const features = useMemo(() => [
    {
      icon: Clock,
      title: "Clock",
      tagline: "Always Know the Time",
      description: "A beautiful, large-format clock that's easy to read from across the room. Perfect for the kitchen or living room.",
      color: "text-amber-600",
      bgColor: "bg-amber-500",
      gradient: "from-amber-500/20 via-amber-400/10 to-transparent",
    },
    {
      icon: Cloud,
      title: "Weather",
      tagline: "Stay Ahead of the Forecast",
      description: "Real-time weather updates so you always know whether to grab an umbrella or a sunhat before heading out.",
      color: "text-sky-600",
      bgColor: "bg-sky-500",
      gradient: "from-sky-500/20 via-sky-400/10 to-transparent",
    },
    {
      icon: ImageIcon,
      title: "Photos",
      tagline: "Your Memories on Display",
      description: "Turn your screen into a digital photo frame showing cherished family moments. Like having a window to your loved ones.",
      color: "text-rose-500",
      bgColor: "bg-rose-400",
      gradient: "from-rose-400/20 via-rose-300/10 to-transparent",
    },
    {
      icon: Calendar,
      title: "Calendar",
      tagline: "Never Miss a Birthday",
      description: "Keep track of birthdays, anniversaries, and family gatherings. Get gentle reminders for the moments that matter most.",
      color: "text-orange-600",
      bgColor: "bg-orange-500",
      gradient: "from-orange-500/20 via-orange-400/10 to-transparent",
    },
    {
      icon: MessageSquare,
      title: "Messages",
      tagline: "Stay Close, Even Far Away",
      description: "Send and receive loving notes between homes. Perfect for quick hellos to grandchildren or checking in with parents.",
      color: "text-violet-500",
      bgColor: "bg-violet-400",
      gradient: "from-violet-400/20 via-violet-300/10 to-transparent",
    },
    {
      icon: Radio,
      title: "Radio",
      tagline: "Music Fills the Home",
      description: "Listen to your favorite radio stations while browsing photos or checking the weather. Background music for your day.",
      color: "text-emerald-600",
      bgColor: "bg-emerald-500",
      gradient: "from-emerald-500/20 via-emerald-400/10 to-transparent",
    },
  ], []);

  const applications = useMemo(() => [
    { icon: Clock, title: "Clock", color: "text-amber-600", bgColor: "bg-amber-500/10", description: "Display current time" },
    { icon: Cloud, title: "Weather", color: "text-sky-600", bgColor: "bg-sky-500/10", description: "Check weather forecasts" },
    { icon: ImageIcon, title: "Photos", color: "text-rose-500", bgColor: "bg-rose-400/10", description: "View family photos" },
    { icon: Calendar, title: "Calendar", color: "text-orange-600", bgColor: "bg-orange-500/10", description: "Track events and birthdays" },
    { icon: StickyNote, title: "Notepad", color: "text-yellow-600", bgColor: "bg-yellow-500/10", description: "Write notes and reminders" },
    { icon: MessageSquare, title: "Messages", color: "text-violet-500", bgColor: "bg-violet-400/10", description: "Send family messages" },
    { icon: Radio, title: "Radio", color: "text-emerald-600", bgColor: "bg-emerald-500/10", description: "Listen to radio stations" },
    { icon: Tv, title: "TV", color: "text-red-500", bgColor: "bg-red-400/10", description: "Watch television channels" },
    { icon: ShoppingCart, title: "Shopping", color: "text-teal-600", bgColor: "bg-teal-500/10", description: "Manage shopping lists" },
    { icon: BarChart3, title: "Stocks", color: "text-indigo-500", bgColor: "bg-indigo-400/10", description: "Track market updates" },
  ], []);

  // Auto-rotate carousel
  useEffect(() => {
    if (isPaused || prefersReducedMotion) return;
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isPaused, prefersReducedMotion, features.length]);

  const fadeInUp = prefersReducedMotion ? {} : {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5 }
  };

  const staggerContainer = prefersReducedMotion ? {} : {
    animate: { transition: { staggerChildren: 0.05 } }
  };

  const fadeInItem = prefersReducedMotion ? {} : {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 }
  };

  const currentFeature = features[activeFeature];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/30">
      {/* Header */}
      <header role="banner" className="flex items-center justify-between px-4 md:px-6 py-3 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <a href="/" className="flex items-center gap-2 min-h-11" aria-label="Family Frame Home">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center" aria-hidden="true">
            <Home className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">Family Frame</span>
        </a>
        <nav role="navigation" aria-label="Main navigation">
          <SignInButton mode="modal">
            <Button className="min-h-11" data-testid="button-sign-in-header">
              <LogIn className="h-4 w-4 mr-2" aria-hidden="true" />
              Sign In
            </Button>
          </SignInButton>
        </nav>
      </header>

      <main role="main" id="main-content">
        {/* Hero Section */}
        <motion.section
          className="px-4 md:px-6 py-8 md:py-12"
          aria-labelledby="hero-heading"
          {...fadeInUp}
        >
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-primary font-medium mb-2">Welcome to Family Frame</p>
            <h1
              id="hero-heading"
              className="text-2xl md:text-3xl lg:text-4xl font-bold mb-3"
              data-testid="text-landing-title"
            >
              Bringing Families Together,<br className="hidden sm:inline" /> One Screen at a Time
            </h1>
            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto mb-6">
              A simple, beautiful display for your home. See the weather, share photos with grandchildren, and stay connected with loved ones.
            </p>
            <SignInButton mode="modal">
              <Button size="lg" className="shadow-lg min-h-12" data-testid="button-sign-in-hero">
                <LogIn className="h-4 w-4 mr-2" aria-hidden="true" />
                Join Your Family
              </Button>
            </SignInButton>
          </div>
        </motion.section>

        {/* Feature Showcase Carousel */}
        <section
          className="px-4 md:px-6 py-6 md:py-10"
          aria-labelledby="showcase-heading"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <h2 id="showcase-heading" className="sr-only">Feature Showcase</h2>
          <div className="max-w-5xl mx-auto">
            {/* Main Banner */}
            <div className={`relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br ${currentFeature.gradient} border shadow-lg`}>
              <div className="flex flex-col md:flex-row items-center gap-6 p-6 md:p-10">
                {/* Icon Display */}
                <motion.div
                  key={`icon-${activeFeature}`}
                  initial={prefersReducedMotion ? {} : { scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className={`w-24 h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-2xl md:rounded-3xl ${currentFeature.bgColor} flex items-center justify-center shadow-xl flex-shrink-0`}
                >
                  <currentFeature.icon className="w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 text-white" />
                </motion.div>

                {/* Content */}
                <motion.div
                  key={`content-${activeFeature}`}
                  initial={prefersReducedMotion ? {} : { x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className="flex-1 text-center md:text-left"
                >
                  <p className={`text-sm font-semibold uppercase tracking-wider ${currentFeature.color} mb-1`}>
                    {currentFeature.title}
                  </p>
                  <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-3">
                    {currentFeature.tagline}
                  </h3>
                  <p className="text-muted-foreground text-sm md:text-base max-w-lg">
                    {currentFeature.description}
                  </p>
                </motion.div>
              </div>

              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/30">
                <motion.div
                  key={`progress-${activeFeature}`}
                  className={`h-full ${currentFeature.bgColor}`}
                  initial={{ width: "0%" }}
                  animate={{ width: isPaused ? "0%" : "100%" }}
                  transition={{ duration: isPaused ? 0 : 5, ease: "linear" }}
                />
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex justify-center gap-2 mt-4" role="tablist" aria-label="Feature tabs">
              {features.map((feature, index) => (
                <button
                  key={feature.title}
                  onClick={() => setActiveFeature(index)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all min-h-10 ${
                    index === activeFeature
                      ? `${feature.bgColor} text-white shadow-md`
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                  role="tab"
                  aria-selected={index === activeFeature}
                  aria-controls={`feature-panel-${index}`}
                  data-testid={`tab-feature-${feature.title.toLowerCase()}`}
                >
                  <feature.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{feature.title}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* All Features Grid */}
        <section className="px-4 md:px-6 pb-6" aria-labelledby="features-heading">
          <div className="max-w-5xl mx-auto">
            <h2 id="features-heading" className="text-center text-lg font-semibold text-muted-foreground mb-4">
              All 10 Features Included
            </h2>
            <motion.ul
              className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-2"
              role="list"
              aria-label="Application features"
              initial="initial"
              animate="animate"
              {...staggerContainer}
            >
              {applications.map((app, index) => (
                <motion.li
                  key={app.title}
                  className="flex flex-col items-center gap-1.5 p-2 md:p-3 rounded-xl bg-card border hover:shadow-md hover:border-primary/20 transition-all"
                  data-testid={`app-card-${index}`}
                  {...fadeInItem}
                >
                  <div
                    className={`w-8 h-8 md:w-10 md:h-10 rounded-lg ${app.bgColor} flex items-center justify-center`}
                    aria-hidden="true"
                  >
                    <app.icon className={`h-4 w-4 md:h-5 md:w-5 ${app.color}`} />
                  </div>
                  <span className="text-xs font-medium text-center">{app.title}</span>
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="px-4 md:px-6 py-6 bg-muted/40" aria-labelledby="benefits-heading">
          <h2 id="benefits-heading" className="sr-only">Why Families Love Family Frame</h2>
          <div className="max-w-4xl mx-auto">
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4" role="list">
              <li className="flex md:flex-col items-center md:text-center gap-3 p-3 md:p-4 min-h-11">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <Home className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm md:mb-1">Easy for Everyone</h3>
                  <p className="text-xs text-muted-foreground">Large buttons and clear text that grandma will love</p>
                </div>
              </li>
              <li className="flex md:flex-col items-center md:text-center gap-3 p-3 md:p-4 min-h-11">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <ImageIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm md:mb-1">Share Precious Moments</h3>
                  <p className="text-xs text-muted-foreground">Photos of grandchildren update automatically</p>
                </div>
              </li>
              <li className="flex md:flex-col items-center md:text-center gap-3 p-3 md:p-4 min-h-11">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm md:mb-1">Feel Close, Always</h3>
                  <p className="text-xs text-muted-foreground">Send love notes even when miles apart</p>
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-4 md:px-6 py-8 text-center" aria-labelledby="cta-heading">
          <h2 id="cta-heading" className="text-lg md:text-xl font-semibold mb-2">Ready to bring your family closer?</h2>
          <p className="text-muted-foreground text-sm mb-4">Completely free. Set up in minutes.</p>
          <SignInButton mode="modal">
            <Button size="lg" className="min-h-12" data-testid="button-sign-in">
              <LogIn className="h-4 w-4 mr-2" aria-hidden="true" />
              Get Started for Free
            </Button>
          </SignInButton>
        </section>
      </main>

      {/* Footer */}
      <footer role="contentinfo" className="py-4 px-4 md:px-6 border-t mt-auto">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            <span>&copy; {new Date().getFullYear()} Family Frame</span>
          </div>
          <nav aria-label="Footer navigation" className="flex flex-wrap justify-center gap-4">
            <a
              href="/privacy"
              className="hover:text-foreground transition-colors min-h-11 flex items-center"
              data-testid="link-privacy"
            >
              Privacy
            </a>
            <a
              href="/terms"
              className="hover:text-foreground transition-colors min-h-11 flex items-center"
              data-testid="link-terms"
            >
              Terms
            </a>
            <a
              href="mailto:support@familyframe.app"
              className="hover:text-foreground transition-colors min-h-11 flex items-center gap-1"
              data-testid="link-support"
            >
              <Mail className="h-3 w-3" aria-hidden="true" />
              Support
            </a>
          </nav>
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
