import { SignInButton } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Home, LogIn, Cloud, ImageIcon, Radio, MessageSquare, Clock, Mail, Calendar } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { APP_MANIFESTS, type AppId } from "@shared/apps";
import { APP_ICONS } from "@/lib/app-registry";

const APP_COLORS: Partial<Record<AppId, { color: string; bgColor: string }>> = {
  clock: { color: "text-amber-600", bgColor: "bg-amber-500/10" },
  weather: { color: "text-sky-600", bgColor: "bg-sky-500/10" },
  photos: { color: "text-rose-500", bgColor: "bg-rose-400/10" },
  calendar: { color: "text-orange-600", bgColor: "bg-orange-500/10" },
  notepad: { color: "text-yellow-600", bgColor: "bg-yellow-500/10" },
  messages: { color: "text-violet-500", bgColor: "bg-violet-400/10" },
  radio: { color: "text-emerald-600", bgColor: "bg-emerald-500/10" },
  tv: { color: "text-red-500", bgColor: "bg-red-400/10" },
  shopping: { color: "text-teal-600", bgColor: "bg-teal-500/10" },
  stocks: { color: "text-indigo-500", bgColor: "bg-indigo-400/10" },
};
const NEUTRAL_COLORS = { color: "text-primary", bgColor: "bg-primary/10" };

const applications = APP_MANIFESTS.filter((a) => !a.fixed).map((a) => ({
  id: a.id,
  title: a.title,
  summary: a.summary,
  icon: APP_ICONS[a.id],
  ...(APP_COLORS[a.id] ?? NEUTRAL_COLORS),
}));

export default function LandingPage() {
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
              All {applications.length} Apps Included
            </h2>
            <motion.ul
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
              role="list"
              aria-label="Application features"
              initial="initial"
              animate="animate"
              {...staggerContainer}
            >
              {applications.map((app, index) => (
                <motion.li
                  key={app.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-card border hover:shadow-md hover:border-primary/20 transition-all"
                  data-testid={`app-card-${index}`}
                  {...fadeInItem}
                >
                  <div
                    className={`w-8 h-8 md:w-10 md:h-10 rounded-lg ${app.bgColor} flex items-center justify-center flex-shrink-0`}
                    aria-hidden="true"
                  >
                    <app.icon className={`h-4 w-4 md:h-5 md:w-5 ${app.color}`} />
                  </div>
                  <div>
                    <span className="text-sm font-medium">{app.title}</span>
                    <p className="text-xs text-muted-foreground">{app.summary}</p>
                  </div>
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

        {/* Google Data Usage Disclosure */}
        <section className="px-4 md:px-6 pb-6" aria-labelledby="data-use-heading">
          <div className="max-w-3xl mx-auto bg-muted/40 rounded-xl p-5 md:p-6 text-sm">
            <h3 id="data-use-heading" className="font-semibold text-base mb-3">How We Use Your Google Data</h3>
            <p className="text-muted-foreground mb-3 leading-relaxed">
              Family Frame integrates with Google Photos to display your cherished memories on your family frame display. Here's exactly what we do with your data:
            </p>
            <ul className="space-y-2 text-muted-foreground list-disc pl-5 mb-3">
              <li><strong className="text-foreground">Read-only access:</strong> We only request permission to view your Google Photos albums (photoslibrary.readonly scope)</li>
              <li><strong className="text-foreground">Your choice:</strong> You select which specific albums to display — we never access albums you haven't chosen</li>
              <li><strong className="text-foreground">No storage:</strong> Your photos are streamed directly from Google Photos and are NOT stored on our servers</li>
              <li><strong className="text-foreground">No sharing:</strong> We never share your Google data with third parties</li>
              <li><strong className="text-foreground">No advertising:</strong> Your data is never used for advertising purposes</li>
              <li><strong className="text-foreground">Revocable:</strong> You can disconnect Google Photos at any time from your account settings</li>
            </ul>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Our use of Google APIs adheres to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </div>
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
