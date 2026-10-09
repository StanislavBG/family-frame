import { Home, ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getAppIcon, useAppLayout } from "@/lib/app-registry";

export function AppSidebar() {
  const [location] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  const { layout, isEnabled } = useAppLayout();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    refetchInterval: 30000,
    enabled: isEnabled("messages"),
  });

  const unreadCount = unreadData?.count || 0;

  const visibleAppItems = layout.menu.map((app) => ({
    id: app.id,
    title: app.title,
    url: app.url,
    icon: getAppIcon(app.id),
  }));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Home className="h-5 w-5" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-sidebar-foreground" data-testid="text-app-name">
                Family Frame
              </span>
              <span className="text-xs text-muted-foreground">
                The Window Between Homes
              </span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleAppItems.map((item) => {
                const isActive = location === item.url;
                const showBadge = item.id === "messages" && unreadCount > 0;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                      className={cn(
                        "h-12 transition-all duration-200",
                        isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                      )}
                    >
                      <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(" ", "-")}`}>
                        <div className="relative">
                          <item.icon className="h-5 w-5" />
                          {showBadge && isCollapsed && (
                            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
                          )}
                        </div>
                        <span className="text-base flex-1">{item.title}</span>
                        {showBadge && !isCollapsed && (
                          <Badge variant="destructive" className="ml-auto text-xs h-5 min-w-[1.25rem] justify-center">
                            {unreadCount}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="w-full h-10"
          data-testid="button-sidebar-toggle"
        >
          {isCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
