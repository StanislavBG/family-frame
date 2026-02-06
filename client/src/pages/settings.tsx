import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Settings,
  Home,
  MapPin,
  Camera,
  Users,
  Check,
  X,
  Plus,
  Trash2,
  RefreshCw,
  Image,
  Link as LinkIcon,
  UserPlus,
  ExternalLink,
  Pencil,
  LayoutGrid,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Calendar,
  StickyNote,
  MessageSquare,
  LayoutDashboard,
  Radio,
  Tv,
  ShoppingCart,
  BarChart3,
  Search,
  TrendingUp,
  Thermometer,
  PanelLeftClose,
  PanelLeft,
  Wrench,
  AppWindow,
  Baby,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSearch } from "wouter";
import { cn } from "@/lib/utils";
import type { UserSettings, ConnectedUser, Person, ConnectionRequest } from "@shared/schema";
import { PhotoSource, availableStocks, defaultAppList, BABY_AGE_RANGES, TV_CHANNELS } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

interface PickerSession {
  id: string;
  pickerUri?: string;
  mediaItemsSet?: boolean;
}

interface IntervalSliderProps {
  value: number;
  onCommit: (value: number) => void;
}

function IntervalSlider({ value, onCommit }: IntervalSliderProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Slideshow Interval</Label>
        <span className="text-sm font-medium text-muted-foreground">
          {localValue} seconds
        </span>
      </div>
      <Slider
        value={[localValue]}
        onValueChange={(vals) => setLocalValue(vals[0])}
        onValueCommit={(vals) => onCommit(vals[0])}
        min={5}
        max={60}
        step={5}
        className="w-full"
        data-testid="slider-photo-interval"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>5s</span>
        <span>30s</span>
        <span>60s</span>
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="h-full flex">
      <div className="w-64 border-r p-4">
        <Skeleton className="h-10 w-full mb-4" />
        <Skeleton className="h-6 w-24 mb-2" />
        <Skeleton className="h-10 w-full mb-2" />
        <Skeleton className="h-10 w-full mb-2" />
        <Skeleton className="h-10 w-full mb-4" />
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-10 w-full mb-2" />
        <Skeleton className="h-10 w-full mb-2" />
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

interface ConnectedUserCardProps {
  user: ConnectedUser;
  onRemove: () => void;
}

function ConnectedUserCard({ user, onRemove }: ConnectedUserCardProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card" data-testid={`connected-user-${user.id}`}>
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback>{user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">{user.homeName || user.username}</p>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
          {user.location && (
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {user.location.city}, {user.location.country}
            </div>
          )}
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove} data-testid={`button-remove-${user.id}`}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface PendingRequestCardProps {
  request: ConnectionRequest;
  onAccept: () => void;
  onReject: () => void;
  isPending: boolean;
}

function PendingRequestCard({ request, onAccept, onReject, isPending }: PendingRequestCardProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card" data-testid={`pending-request-${request.id}`}>
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback>{request.fromUsername.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">@{request.fromUsername}</p>
          <p className="text-sm text-muted-foreground">
            Wants to connect with you
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={onAccept}
          disabled={isPending}
          data-testid={`button-accept-${request.id}`}
        >
          <Check className="h-4 w-4 mr-1" />
          Accept
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onReject}
          disabled={isPending}
          data-testid={`button-reject-${request.id}`}
        >
          <X className="h-4 w-4 mr-1" />
          Reject
        </Button>
      </div>
    </div>
  );
}

interface SentRequestCardProps {
  request: ConnectionRequest;
}

function SentRequestCard({ request }: SentRequestCardProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card" data-testid={`sent-request-${request.id}`}>
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback>{request.toUsername.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">@{request.toUsername}</p>
          <p className="text-sm text-muted-foreground">
            Waiting for approval
          </p>
        </div>
      </div>
      <Badge variant="secondary">Pending</Badge>
    </div>
  );
}

interface PersonCardProps {
  person: Person;
  onRemove: () => void;
  onEdit: () => void;
}

function PersonCard({ person, onRemove, onEdit }: PersonCardProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card" data-testid={`person-${person.id}`}>
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback>{person.name.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">{person.name}</p>
          {person.birthday && (
            <p className="text-sm text-muted-foreground">
              Birthday: {new Date(person.birthday).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-person-${person.id}`}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRemove} data-testid={`button-remove-person-${person.id}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

const appIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  home: LayoutDashboard,
  settings: Settings,
  clock: Clock,
  weather: Cloud,
  photos: Image,
  calendar: Calendar,
  notepad: StickyNote,
  messages: MessageSquare,
  radio: Radio,
  "baby-songs": Baby,
  tv: Tv,
  shopping: ShoppingCart,
  stocks: BarChart3,
};

type NavSection = "household" | "location" | "people" | "connections" | "weather" | "picture-frame" | "baby-songs" | "tv" | "stocks" | "apps";

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isSystem: boolean;
}

const navItems: NavItem[] = [
  { id: "household", label: "Household Identity", icon: Home, isSystem: true },
  { id: "location", label: "Location", icon: MapPin, isSystem: true },
  { id: "people", label: "People", icon: Users, isSystem: true },
  { id: "connections", label: "Connections", icon: LinkIcon, isSystem: true },
  { id: "weather", label: "Weather", icon: Cloud, isSystem: false },
  { id: "picture-frame", label: "Picture Frame", icon: Image, isSystem: false },
  { id: "baby-songs", label: "Baby Songs", icon: Baby, isSystem: false },
  { id: "tv", label: "TV", icon: Tv, isSystem: false },
  { id: "stocks", label: "Stocks", icon: TrendingUp, isSystem: false },
  { id: "apps", label: "App Picker", icon: LayoutGrid, isSystem: false },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const sectionFromUrl = urlParams.get("section");
  const validSections: NavSection[] = ["household", "location", "people", "connections", "weather", "picture-frame", "baby-songs", "tv", "stocks", "apps"];
  const initialSection = sectionFromUrl && validSections.includes(sectionFromUrl as NavSection) 
    ? sectionFromUrl as NavSection 
    : "household";
  
  const [activeSection, setActiveSection] = useState<NavSection>(initialSection);
  const [searchQuery, setSearchQuery] = useState("");
  const [homeName, setHomeName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [connectUsername, setConnectUsername] = useState("");
  const [deletePersonId, setDeletePersonId] = useState<string | null>(null);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonBirthday, setNewPersonBirthday] = useState("");
  const [editPerson, setEditPerson] = useState<Person | null>(null);
  const [editPersonName, setEditPersonName] = useState("");
  const [editPersonBirthday, setEditPersonBirthday] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [systemExpanded, setSystemExpanded] = useState(true);
  const [appsExpanded, setAppsExpanded] = useState(true);
  
  useEffect(() => {
    if (sectionFromUrl && validSections.includes(sectionFromUrl as NavSection)) {
      setActiveSection(sectionFromUrl as NavSection);
    }
  }, [sectionFromUrl]);

  useEffect(() => {
    const success = urlParams.get("success");
    const error = urlParams.get("error");
    
    if (success === "google_connected") {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Google Photos connected successfully!" });
      setActiveSection("picture-frame");
      window.history.replaceState({}, "", "/settings?section=picture-frame");
    }
    
    if (error) {
      toast({ 
        title: "Failed to connect Google Photos", 
        description: error === "token_exchange_failed" ? "Could not complete authorization" : "Please try again",
        variant: "destructive" 
      });
      window.history.replaceState({}, "", "/settings?section=picture-frame");
    }
  }, []);

  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pollingSession, setPollingSession] = useState<string | null>(null);
  const [localTvVolume, setLocalTvVolume] = useState(50);
  const tvVolumeInitialized = useRef(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (settings && !tvVolumeInitialized.current) {
      setLocalTvVolume(settings.tvVolume ?? 50);
      tvVolumeInitialized.current = true;
    }
  }, [settings]);

  const { data: pickerSessionData, refetch: refetchPickerSession } = useQuery<{ hasSession: boolean; photoCount: number; session?: PickerSession }>({
    queryKey: ["/api/google/picker/current"],
    enabled: settings?.googlePhotosConnected === true,
    staleTime: 0,
  });

  const { data: connectedUsers } = useQuery<ConnectedUser[]>({
    queryKey: ["/api/connections"],
  });

  const { data: pendingRequests } = useQuery<ConnectionRequest[]>({
    queryKey: ["/api/connections/requests"],
  });

  const { data: sentRequests } = useQuery<ConnectionRequest[]>({
    queryKey: ["/api/connections/sent"],
  });

  const { data: people } = useQuery<Person[]>({
    queryKey: ["/api/people/list"],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<UserSettings>) => {
      return apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update settings", description: error.message, variant: "destructive" });
    },
  });

  const connectGoogleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/google/auth-url");
      return response as { url: string };
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast({ title: "Failed to connect Google Photos", description: error.message, variant: "destructive" });
    },
  });

  const disconnectGoogleMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/google/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/google/albums/separated"] });
      toast({ title: "Google Photos disconnected" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" });
    },
  });

  const createPickerSessionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/google/picker/session") as Promise<PickerSession>;
    },
    onSuccess: (session) => {
      if (session.pickerUri) {
        window.open(session.pickerUri, "_blank", "width=800,height=600");
        setIsPickerOpen(true);
        setPollingSession(session.id);
        toast({ 
          title: "Photo Picker opened", 
          description: "Select your photos in the new window, then come back here." 
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to open photo picker", description: error.message, variant: "destructive" });
    },
  });

  const clearPhotosMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/photos/all") as Promise<{ success: boolean; count: number }>;
    },
    onSuccess: () => {
      toast({ title: "Photos cleared" });
      queryClient.invalidateQueries({ queryKey: ["/api/google/picker/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/photos"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to clear photos", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!pollingSession) return;

    const pollSession = async () => {
      try {
        const response = await apiRequest("GET", `/api/google/picker/session/${pollingSession}`) as PickerSession;
        if (response.mediaItemsSet) {
          setIsPickerOpen(false);
          setPollingSession(null);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          queryClient.invalidateQueries({ queryKey: ["/api/google/picker/current"] });
          queryClient.invalidateQueries({ queryKey: ["/api/photos"] });
          toast({ title: "Photos selected!", description: "Your photos are ready for the Picture Frame." });
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };

    pollingRef.current = setInterval(pollSession, 3000);
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [pollingSession]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const connectUserMutation = useMutation({
    mutationFn: async (username: string) => {
      return apiRequest("POST", "/api/connections", { username });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections/sent"] });
      setConnectUsername("");
      toast({ title: "Connection request sent", description: "Waiting for the other user to accept" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send request", description: error.message, variant: "destructive" });
    },
  });

  const acceptRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest("POST", `/api/connections/requests/${requestId}/accept`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/connections/requests"] });
      toast({ title: "Connection accepted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to accept request", description: error.message, variant: "destructive" });
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest("POST", `/api/connections/requests/${requestId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections/requests"] });
      toast({ title: "Connection rejected" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reject request", description: error.message, variant: "destructive" });
    },
  });

  const removeConnectionMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/connections/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      toast({ title: "Connection removed" });
    },
  });

  const createPersonMutation = useMutation({
    mutationFn: async (data: { name: string; birthday?: string }) => {
      return apiRequest("POST", "/api/people", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people/list"] });
      setAddPersonOpen(false);
      setNewPersonName("");
      setNewPersonBirthday("");
      toast({ title: "Person added to household" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add person", description: error.message, variant: "destructive" });
    },
  });

  const updatePersonMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; birthday?: string }) => {
      return apiRequest("PATCH", `/api/people/${data.id}`, { name: data.name, birthday: data.birthday });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people/list"] });
      setEditPerson(null);
      setEditPersonName("");
      setEditPersonBirthday("");
      toast({ title: "Person updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update person", description: error.message, variant: "destructive" });
    },
  });

  const removePersonMutation = useMutation({
    mutationFn: async (personId: string) => {
      return apiRequest("DELETE", `/api/people/${personId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people/list"] });
      setDeletePersonId(null);
      toast({ title: "Person removed from household" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove person", description: error.message, variant: "destructive" });
    },
  });

  const handleEditPerson = (person: Person) => {
    setEditPerson(person);
    setEditPersonName(person.name);
    setEditPersonBirthday(person.birthday ? person.birthday.split("T")[0] : "");
  };

  const handleSaveEditPerson = () => {
    if (!editPerson) return;
    updatePersonMutation.mutate({
      id: editPerson.id,
      name: editPersonName.trim(),
      birthday: editPersonBirthday || undefined,
    });
  };

  const handleAddPerson = () => {
    createPersonMutation.mutate({
      name: newPersonName.trim(),
      birthday: newPersonBirthday || undefined,
    });
  };

  const filteredNavItems = navItems.filter(item => 
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const systemItems = filteredNavItems.filter(item => item.isSystem);
  const appItems = filteredNavItems.filter(item => !item.isSystem);

  const handleNavClick = (section: NavSection) => {
    setActiveSection(section);
    setMobileNavOpen(false);
    window.history.replaceState({}, "", `/settings?section=${section}`);
  };

  if (settingsLoading) {
    return <SettingsSkeleton />;
  }

  const renderNavItem = (item: NavItem, collapsed: boolean = false) => {
    const Icon = item.icon;
    const isActive = activeSection === item.id;
    return (
      <button
        key={item.id}
        onClick={() => handleNavClick(item.id)}
        className={cn(
          "w-full flex items-center rounded-md text-left transition-all duration-200",
          collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
          isActive 
            ? "bg-primary/10 text-primary font-medium" 
            : "hover-elevate text-muted-foreground hover:text-foreground"
        )}
        data-testid={`nav-${item.id}`}
        title={collapsed ? item.label : undefined}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </button>
    );
  };

  const renderSectionHeader = (
    label: string, 
    icon: React.ComponentType<{ className?: string }>,
    expanded: boolean, 
    onToggle: () => void, 
    itemCount: number,
    collapsed: boolean = false
  ) => {
    const Icon = icon;
    if (collapsed) {
      return (
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 rounded-md hover-elevate text-muted-foreground"
          title={`${label} (${itemCount})`}
          data-testid={`toggle-${label.toLowerCase()}-collapsed`}
        >
          <Icon className="h-4 w-4" />
        </button>
      );
    }
    return (
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 rounded-md hover-elevate text-muted-foreground group"
        data-testid={`toggle-${label.toLowerCase()}`}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
          {!expanded && (
            <span className="text-xs">({itemCount})</span>
          )}
        </div>
      </button>
    );
  };

  const renderContent = () => {
    switch (activeSection) {
      case "household":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Household Identity</h2>
              <p className="text-muted-foreground">Your home's display name shown to connected families</p>
            </div>
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="home-name">Home Name</Label>
                  <Input
                    id="home-name"
                    placeholder="e.g., The Smith House"
                    defaultValue={settings?.homeName || ""}
                    onChange={(e) => setHomeName(e.target.value)}
                    data-testid="input-home-name"
                  />
                  <p className="text-sm text-muted-foreground">
                    This name will be shown to connected family members
                  </p>
                </div>

                <Button 
                  onClick={() => updateSettingsMutation.mutate({ homeName: homeName || settings?.homeName })} 
                  disabled={updateSettingsMutation.isPending} 
                  data-testid="button-save-household"
                >
                  {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>
          </div>
        );

      case "location":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Location</h2>
              <p className="text-muted-foreground">Your home's location for weather and timezone</p>
            </div>
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      placeholder="e.g., San Francisco"
                      defaultValue={settings?.location?.city || ""}
                      onChange={(e) => setCity(e.target.value)}
                      data-testid="input-city"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      placeholder="e.g., USA"
                      defaultValue={settings?.location?.country || ""}
                      onChange={(e) => setCountry(e.target.value)}
                      data-testid="input-country"
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Weather uses your device's GPS when available. This saved location is used as a backup when GPS is unavailable.
                </p>

                <Button 
                  onClick={() => updateSettingsMutation.mutate({ 
                    location: {
                      city: city || settings?.location?.city || "",
                      country: country || settings?.location?.country || "",
                    }
                  })} 
                  disabled={updateSettingsMutation.isPending} 
                  data-testid="button-save-location"
                >
                  {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>
          </div>
        );

      case "people":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Household Members</h2>
              <p className="text-muted-foreground">Manage the people in your household for calendar events</p>
            </div>
            <Card>
              <CardContent className="pt-6 space-y-4">
                {people && people.length > 0 ? (
                  people.map((person) => (
                    <PersonCard
                      key={person.id}
                      person={person}
                      onRemove={() => setDeletePersonId(person.id)}
                      onEdit={() => handleEditPerson(person)}
                    />
                  ))
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                      <Users className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="font-medium mb-2">No Household Members</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Add household members to include them in calendar events
                    </p>
                  </div>
                )}
                <Button variant="outline" className="w-full" onClick={() => setAddPersonOpen(true)} data-testid="button-add-member">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Person
                </Button>
              </CardContent>
            </Card>
          </div>
        );

      case "connections":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Connected Homes</h2>
              <p className="text-muted-foreground">Connect with other Family Frame users to share weather and events</p>
            </div>
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="flex gap-4">
                  <Input
                    placeholder="Enter username to connect"
                    value={connectUsername}
                    onChange={(e) => setConnectUsername(e.target.value)}
                    data-testid="input-connect-username"
                  />
                  <Button
                    onClick={() => connectUserMutation.mutate(connectUsername)}
                    disabled={!connectUsername || connectUserMutation.isPending}
                    data-testid="button-connect-user"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Send Request
                  </Button>
                </div>

                {pendingRequests && pendingRequests.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Pending Requests ({pendingRequests.length})
                    </h4>
                    {pendingRequests.map((request) => (
                      <PendingRequestCard
                        key={request.id}
                        request={request}
                        onAccept={() => acceptRequestMutation.mutate(request.id)}
                        onReject={() => rejectRequestMutation.mutate(request.id)}
                        isPending={acceptRequestMutation.isPending || rejectRequestMutation.isPending}
                      />
                    ))}
                  </div>
                )}

                {sentRequests && sentRequests.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Sent Requests ({sentRequests.length})
                    </h4>
                    {sentRequests.map((request) => (
                      <SentRequestCard key={request.id} request={request} />
                    ))}
                  </div>
                )}

                {connectedUsers && connectedUsers.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Connected ({connectedUsers.length})
                    </h4>
                    {connectedUsers.map((user) => (
                      <ConnectedUserCard
                        key={user.id}
                        user={user}
                        onRemove={() => removeConnectionMutation.mutate(user.id)}
                      />
                    ))}
                  </div>
                )}

                {(!connectedUsers || connectedUsers.length === 0) && 
                 (!pendingRequests || pendingRequests.length === 0) && 
                 (!sentRequests || sentRequests.length === 0) && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                      <Users className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="font-medium mb-2">No Connections Yet</h3>
                    <p className="text-sm text-muted-foreground">
                      Enter a username above to send a connection request
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case "weather":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Weather Settings</h2>
              <p className="text-muted-foreground">Configure how weather is displayed</p>
            </div>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-4 w-4" />
                      <Label>Temperature Unit</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">Choose your preferred unit</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">°C</span>
                    <Switch
                      checked={settings?.temperatureUnit === "fahrenheit"}
                      onCheckedChange={(checked) =>
                        updateSettingsMutation.mutate({
                          temperatureUnit: checked ? "fahrenheit" : "celsius",
                        })
                      }
                      data-testid="switch-temp-unit"
                    />
                    <span className="text-sm">°F</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <Label>Time Format</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">Choose 12-hour or 24-hour (military) time</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">12h</span>
                    <Switch
                      checked={settings?.timeFormat === "24h"}
                      onCheckedChange={(checked) =>
                        updateSettingsMutation.mutate({
                          timeFormat: checked ? "24h" : "12h",
                        })
                      }
                      data-testid="switch-time-format"
                    />
                    <span className="text-sm">24h</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "picture-frame":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Picture Frame</h2>
              <p className="text-muted-foreground">Manage your photo sources and slideshow settings</p>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Google Photos
                </CardTitle>
                <CardDescription>
                  Connect your Google Photos to display shared memories
                </CardDescription>
              </CardHeader>
              <CardContent>
                {settings?.googlePhotosConnected ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                          <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <p className="font-medium text-green-700 dark:text-green-300">Connected</p>
                          <p className="text-sm text-green-600 dark:text-green-400">
                            Google Photos is linked to your account
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => disconnectGoogleMutation.mutate()}
                        disabled={disconnectGoogleMutation.isPending}
                        data-testid="button-disconnect-google"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {disconnectGoogleMutation.isPending ? "Disconnecting..." : "Disconnect"}
                      </Button>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Photo Selection</h4>
                          <p className="text-sm text-muted-foreground">
                            {pickerSessionData?.hasSession && pickerSessionData.session?.mediaItemsSet
                              ? "Photos selected for your Picture Frame"
                              : "Choose photos to display on your Picture Frame"}
                          </p>
                        </div>
                      </div>

                      {isPickerOpen ? (
                        <div className="p-6 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
                          <div className="flex items-center gap-3">
                            <div className="animate-spin">
                              <RefreshCw className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div>
                              <p className="font-medium text-amber-700 dark:text-amber-300">Waiting for selection...</p>
                              <p className="text-sm text-amber-600 dark:text-amber-400">
                                Select photos in the Google Photos picker window, then close it to continue.
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={() => {
                              setIsPickerOpen(false);
                              setPollingSession(null);
                              if (pollingRef.current) {
                                clearInterval(pollingRef.current);
                                pollingRef.current = null;
                              }
                            }}
                            data-testid="button-cancel-picker"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : pickerSessionData?.hasSession && pickerSessionData.photoCount > 0 ? (
                        <div className="p-6 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
                          <div className="flex items-center justify-between flex-wrap gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                                <Image className="h-5 w-5 text-green-600 dark:text-green-400" />
                              </div>
                              <div>
                                <p className="font-medium text-green-700 dark:text-green-300">
                                  {pickerSessionData.photoCount} {pickerSessionData.photoCount === 1 ? "Photo" : "Photos"} Selected
                                </p>
                                <p className="text-sm text-green-600 dark:text-green-400">
                                  Add more photos or clear the collection
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                onClick={() => createPickerSessionMutation.mutate()}
                                disabled={createPickerSessionMutation.isPending}
                                data-testid="button-add-more-photos"
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Add More
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => clearPhotosMutation.mutate()}
                                disabled={clearPhotosMutation.isPending}
                                data-testid="button-clear-photos"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8 border-2 border-dashed rounded-lg">
                          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                            <Image className="h-8 w-8 text-muted-foreground" />
                          </div>
                          <h3 className="font-medium mb-2">No Photos Selected</h3>
                          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                            Click below to open the Google Photos picker and choose which photos to display
                          </p>
                          <Button
                            onClick={() => createPickerSessionMutation.mutate()}
                            disabled={createPickerSessionMutation.isPending}
                            data-testid="button-select-photos"
                          >
                            <Camera className="h-4 w-4 mr-2" />
                            {createPickerSessionMutation.isPending ? "Opening..." : "Select Photos"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                      <Camera className="h-10 w-10 text-primary" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">Connect Google Photos</h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      Link your Google Photos account to display your shared albums on the Picture Frame
                    </p>
                    <Button
                      onClick={() => connectGoogleMutation.mutate()}
                      disabled={connectGoogleMutation.isPending}
                      size="lg"
                      data-testid="button-connect-google"
                    >
                      <ExternalLink className="h-5 w-5 mr-2" />
                      {connectGoogleMutation.isPending ? "Connecting..." : "Connect Google Photos"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="h-5 w-5" />
                  Display Settings
                </CardTitle>
                <CardDescription>
                  Choose your photo source and slideshow timing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Photo Source</Label>
                  <Select
                    value={settings?.photoSource || PhotoSource.PIXABAY}
                    onValueChange={(value) => 
                      updateSettingsMutation.mutate({ photoSource: value as typeof PhotoSource.GOOGLE_PHOTOS | typeof PhotoSource.PIXABAY })
                    }
                    data-testid="select-photo-source"
                  >
                    <SelectTrigger data-testid="select-photo-source-trigger">
                      <SelectValue placeholder="Select photo source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PhotoSource.GOOGLE_PHOTOS} data-testid="option-google-photos">
                        <div className="flex items-center gap-2">
                          <Camera className="h-4 w-4" />
                          Google Photos
                        </div>
                      </SelectItem>
                      <SelectItem value={PhotoSource.PIXABAY} data-testid="option-pixabay">
                        <div className="flex items-center gap-2">
                          <Image className="h-4 w-4" />
                          Pixabay Ambient
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    {settings?.photoSource === PhotoSource.PIXABAY 
                      ? "Beautiful, high-quality ambient photos from Pixabay"
                      : "Display photos from your selected Google Photos albums"}
                  </p>
                </div>

                {settings?.photoSource === PhotoSource.GOOGLE_PHOTOS && !settings?.googlePhotosConnected && (
                  <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Connect your Google Photos account above to use this source.
                    </p>
                  </div>
                )}

                <IntervalSlider 
                  value={settings?.photoInterval || 10}
                  onCommit={(value) => updateSettingsMutation.mutate({ photoInterval: value })}
                />
              </CardContent>
            </Card>
          </div>
        );

      case "baby-songs":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Baby Songs</h2>
              <p className="text-muted-foreground">Set the age for age-appropriate content</p>
            </div>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Child's Age Group</Label>
                  <Select
                    value={(() => {
                      const ageMonths = settings?.babyAgeMonths ?? 12;
                      const group = BABY_AGE_RANGES.find(
                        (r) => ageMonths >= r.minMonths && ageMonths < r.maxMonths
                      );
                      return group?.id || BABY_AGE_RANGES[BABY_AGE_RANGES.length - 1].id;
                    })()}
                    onValueChange={(value) => {
                      const range = BABY_AGE_RANGES.find((r) => r.id === value);
                      if (range) {
                        updateSettingsMutation.mutate({ babyAgeMonths: range.defaultAge });
                      }
                    }}
                  >
                    <SelectTrigger data-testid="select-baby-age-settings">
                      <SelectValue placeholder="Select age group" />
                    </SelectTrigger>
                    <SelectContent>
                      {BABY_AGE_RANGES.map((range) => (
                        <SelectItem key={range.id} value={range.id}>
                          {range.label} ({range.description})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-muted-foreground">
                  Content is filtered based on the selected age group. Songs and stories appropriate for the selected age will be shown.
                </p>
              </CardContent>
            </Card>
          </div>
        );

      case "tv":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">TV Settings</h2>
              <p className="text-muted-foreground">Configure your Bulgarian TV experience</p>
            </div>
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Default Volume</Label>
                    <span className="text-sm font-medium text-muted-foreground">
                      {localTvVolume}%
                    </span>
                  </div>
                  <Slider
                    value={[localTvVolume]}
                    onValueChange={(vals) => setLocalTvVolume(vals[0])}
                    onValueCommit={(vals) => updateSettingsMutation.mutate({ tvVolume: vals[0] })}
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                    data-testid="slider-tv-volume"
                  />
                </div>

                <div className="space-y-3">
                  <Label>Default Channel</Label>
                  <Select
                    value={settings?.lastTvChannel || ""}
                    onValueChange={(value) => updateSettingsMutation.mutate({ lastTvChannel: value })}
                  >
                    <SelectTrigger data-testid="select-default-channel">
                      <SelectValue placeholder="No default channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {TV_CHANNELS.map((channel) => (
                        <SelectItem key={channel.url} value={channel.url}>
                          <div className="flex items-center gap-2">
                            {channel.logo && (
                              <img src={channel.logo} alt="" className="w-5 h-5 object-contain rounded" />
                            )}
                            <span>{channel.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    This channel will be pre-selected when you open the TV app
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "stocks":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">Stock Tracker</h2>
              <p className="text-muted-foreground">Select stocks to display on your home dashboard</p>
            </div>
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-3">
                  {availableStocks.map((stock) => {
                    const currentStocks = settings?.trackedStocks || ["DJI", "VNQ", "BTC"];
                    const isTracked = currentStocks.includes(stock.symbol);
                    return (
                      <div 
                        key={stock.symbol}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      >
                        <div>
                          <p className="font-medium">{stock.name}</p>
                          <p className="text-sm text-muted-foreground">{stock.symbol}</p>
                        </div>
                        <Switch
                          checked={isTracked}
                          onCheckedChange={(checked) => {
                            let newStocks: string[];
                            if (checked) {
                              newStocks = currentStocks.includes(stock.symbol) 
                                ? currentStocks 
                                : [...currentStocks, stock.symbol];
                            } else {
                              newStocks = currentStocks.filter(s => s !== stock.symbol);
                            }
                            updateSettingsMutation.mutate({ trackedStocks: newStocks });
                          }}
                          data-testid={`switch-stock-${stock.symbol.toLowerCase()}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "apps":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-1">App Picker</h2>
              <p className="text-muted-foreground">Choose which apps appear in your menu and arrange their order</p>
            </div>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground uppercase tracking-wide">Fixed Apps</Label>
                  {defaultAppList.filter(app => app.fixed).map((app) => {
                    const IconComponent = appIconMap[app.id] || LayoutGrid;
                    return (
                      <div 
                        key={app.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                        data-testid={`app-picker-${app.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                            <IconComponent className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-medium">{app.title}</span>
                        </div>
                        <Badge variant="secondary">Always visible</Badge>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2 pt-4 border-t">
                  <Label className="text-sm text-muted-foreground uppercase tracking-wide">Customizable Apps</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Toggle visibility and use arrows to reorder
                  </p>
                  {(() => {
                    const allAppIds = defaultAppList.map(app => app.id);
                    const movableApps = defaultAppList.filter(app => !app.fixed);
                    const visibleApps = settings?.visibleApps || allAppIds;
                    const appOrder = settings?.appOrder || movableApps.map(app => app.id);

                    const isAppVisible = (appId: string) => {
                      const app = defaultAppList.find(a => a.id === appId);
                      if (app?.fixed) return true;
                      return visibleApps.includes(appId);
                    };

                    const toggleAppVisibility = (appId: string) => {
                      const app = defaultAppList.find(a => a.id === appId);
                      if (app?.fixed) return;
                      
                      const newVisibleApps = isAppVisible(appId)
                        ? visibleApps.filter(id => id !== appId)
                        : [...visibleApps, appId];
                      
                      updateSettingsMutation.mutate({ visibleApps: newVisibleApps });
                    };

                    const moveApp = (appId: string, direction: "up" | "down") => {
                      const currentIndex = appOrder.indexOf(appId);
                      if (currentIndex === -1) return;
                      
                      const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
                      if (newIndex < 0 || newIndex >= appOrder.length) return;
                      
                      const newOrder = [...appOrder];
                      [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];
                      
                      updateSettingsMutation.mutate({ appOrder: newOrder });
                    };

                    const orderedMovableApps = [...movableApps].sort((a, b) => {
                      const indexA = appOrder.indexOf(a.id);
                      const indexB = appOrder.indexOf(b.id);
                      if (indexA === -1) return 1;
                      if (indexB === -1) return -1;
                      return indexA - indexB;
                    });

                    return orderedMovableApps.map((app, index) => {
                      const IconComponent = appIconMap[app.id] || LayoutGrid;
                      return (
                        <div 
                          key={app.id}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg border",
                            isAppVisible(app.id) ? "bg-card" : "bg-muted/20 opacity-60"
                          )}
                          data-testid={`app-picker-${app.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => moveApp(app.id, "up")}
                                disabled={index === 0}
                                data-testid={`button-move-up-${app.id}`}
                              >
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => moveApp(app.id, "down")}
                                disabled={index === orderedMovableApps.length - 1}
                                data-testid={`button-move-down-${app.id}`}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                              <IconComponent className="h-4 w-4 text-primary" />
                            </div>
                            <span className="font-medium">{app.title}</span>
                          </div>
                          <Switch
                            checked={isAppVisible(app.id)}
                            onCheckedChange={() => toggleAppVisibility(app.id)}
                            data-testid={`switch-app-${app.id}`}
                          />
                        </div>
                      );
                    });
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          data-testid="button-mobile-nav"
        >
          {navItems.find(i => i.id === activeSection)?.label || "Menu"}
        </Button>
      </div>

      {/* Mobile Nav Dropdown */}
      {mobileNavOpen && (
        <div className="md:hidden border-b bg-background p-4 space-y-1">
          {navItems.map(item => renderNavItem(item))}
        </div>
      )}

      {/* Left Navigation Panel - Desktop */}
      <div 
        className={cn(
          "hidden md:flex flex-col border-r bg-muted/30 shrink-0 transition-all duration-300",
          sidebarCollapsed ? "w-14" : "w-64"
        )}
      >
        <div className={cn("border-b transition-all duration-300", sidebarCollapsed ? "p-2" : "p-4")}>
          <div className={cn(
            "flex items-center mb-4 transition-all duration-300",
            sidebarCollapsed ? "justify-center" : "gap-3"
          )}>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            {!sidebarCollapsed && <h1 className="text-lg font-semibold">Settings</h1>}
          </div>
          {sidebarCollapsed ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSidebarCollapsed(false);
                setSystemExpanded(true);
                setAppsExpanded(true);
              }}
              className="w-full"
              title="Search settings"
              data-testid="button-search-collapsed"
            >
              <Search className="h-4 w-4" />
            </Button>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-settings"
              />
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className={cn("space-y-4 transition-all duration-300", sidebarCollapsed ? "p-2" : "p-4")}>
            {systemItems.length > 0 && (
              <div className="space-y-1">
                {renderSectionHeader("System", Wrench, systemExpanded, () => setSystemExpanded(!systemExpanded), systemItems.length, sidebarCollapsed)}
                {systemExpanded && systemItems.map(item => renderNavItem(item, sidebarCollapsed))}
              </div>
            )}

            {appItems.length > 0 && (
              <div className="space-y-1">
                {renderSectionHeader("Applications", AppWindow, appsExpanded, () => setAppsExpanded(!appsExpanded), appItems.length, sidebarCollapsed)}
                {appsExpanded && appItems.map(item => renderNavItem(item, sidebarCollapsed))}
              </div>
            )}

            {filteredNavItems.length === 0 && searchQuery && !sidebarCollapsed && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No settings found for "{searchQuery}"
              </p>
            )}
          </div>
        </ScrollArea>

        {/* Collapse Toggle Button */}
        <div className={cn("border-t transition-all duration-300", sidebarCollapsed ? "p-2" : "p-4")}>
          <Button
            variant="ghost"
            size={sidebarCollapsed ? "icon" : "default"}
            onClick={() => {
              if (sidebarCollapsed) {
                setSidebarCollapsed(false);
                setSystemExpanded(true);
                setAppsExpanded(true);
              } else {
                setSidebarCollapsed(true);
              }
            }}
            className={cn("w-full", sidebarCollapsed && "justify-center")}
            data-testid="button-toggle-sidebar"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 mr-2" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Right Content Panel */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-3xl">
          {renderContent()}
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={!!deletePersonId} onOpenChange={() => setDeletePersonId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Person</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this person from your household? They will be removed from any events they are associated with.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePersonId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletePersonId && removePersonMutation.mutate(deletePersonId)}
              disabled={removePersonMutation.isPending}
              data-testid="button-confirm-remove-person"
            >
              {removePersonMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addPersonOpen} onOpenChange={(open) => {
        setAddPersonOpen(open);
        if (!open) {
          setNewPersonName("");
          setNewPersonBirthday("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Household Member</DialogTitle>
            <DialogDescription>
              Add a person to your household. They can be assigned to calendar events.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="person-name">Name</Label>
              <Input
                id="person-name"
                placeholder="Enter name"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                data-testid="input-person-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="person-birthday">Birthday (optional)</Label>
              <Input
                id="person-birthday"
                type="date"
                value={newPersonBirthday}
                onChange={(e) => setNewPersonBirthday(e.target.value)}
                data-testid="input-person-birthday"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPersonOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddPerson}
              disabled={createPersonMutation.isPending || !newPersonName.trim()}
              data-testid="button-confirm-add-person"
            >
              {createPersonMutation.isPending ? "Adding..." : "Add Person"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editPerson} onOpenChange={(open) => {
        if (!open) {
          setEditPerson(null);
          setEditPersonName("");
          setEditPersonBirthday("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Household Member</DialogTitle>
            <DialogDescription>
              Update the person's information.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-person-name">Name</Label>
              <Input
                id="edit-person-name"
                placeholder="Enter name"
                value={editPersonName}
                onChange={(e) => setEditPersonName(e.target.value)}
                data-testid="input-edit-person-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-person-birthday">Birthday (optional)</Label>
              <Input
                id="edit-person-birthday"
                type="date"
                value={editPersonBirthday}
                onChange={(e) => setEditPersonBirthday(e.target.value)}
                data-testid="input-edit-person-birthday"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPerson(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEditPerson}
              disabled={updatePersonMutation.isPending || !editPersonName.trim()}
              data-testid="button-confirm-edit-person"
            >
              {updatePersonMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
