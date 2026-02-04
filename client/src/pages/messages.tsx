import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Send, Check, CheckCheck, Trash2, Mail, MailOpen, Users, Plus, ArrowUpRight, ArrowDownLeft, Maximize, Minimize, Reply } from "lucide-react";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { Message, ConnectedUser } from "@shared/schema";

export default function MessagesPage() {
  const { isFullscreen, toggleFullscreen, containerRef } = useFullscreen();
  const { user } = useUser();
  const { toast } = useToast();
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<string>("");
  const [messageContent, setMessageContent] = useState("");

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
  });

  const { data: connections = [] } = useQuery<ConnectedUser[]>({
    queryKey: ["/api/connections"],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { toUserId: string; toUsername: string; content: string }) => {
      return apiRequest("POST", "/api/messages", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
      toast({ title: "Message sent" });
      setNewMessageOpen(false);
      setSelectedRecipient("");
      setMessageContent("");
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return apiRequest("PATCH", `/api/messages/${messageId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/messages/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
      toast({ title: "All messages marked as read" });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return apiRequest("DELETE", `/api/messages/${messageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
      toast({ title: "Message deleted" });
    },
  });

  const handleSendMessage = () => {
    const recipient = connections.find(c => c.id === selectedRecipient);
    if (!recipient || !messageContent.trim()) return;

    sendMessageMutation.mutate({
      toUserId: recipient.id,
      toUsername: recipient.username,
      content: messageContent.trim(),
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-CA");
  };

  const unreadCount = messages.filter(m => !m.isRead).length;

  const handleReply = (message: Message) => {
    if (!message.isRead) {
      markReadMutation.mutate(message.id);
    }
    setSelectedRecipient(message.fromUserId);
    setMessageContent("");
    setNewMessageOpen(true);
  };

  if (isLoading) {
    return (
      <div ref={containerRef} className="h-full p-4 md:p-8 overflow-auto bg-background">
        <div className="fixed top-4 right-4 z-50">
          <Button
            variant="secondary"
            size="icon"
            onClick={toggleFullscreen}
            className="h-10 w-10"
            data-testid="button-fullscreen"
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </Button>
        </div>
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-64 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full p-4 md:p-8 overflow-auto bg-background">
      {/* Fixed Fullscreen Button */}
      <div className="fixed top-4 right-4 z-50">
        <Button
          variant="secondary"
          size="icon"
          onClick={toggleFullscreen}
          className="h-10 w-10"
          data-testid="button-fullscreen"
        >
          {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
        </Button>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-semibold" data-testid="text-messages-title">Messages</h1>
            {unreadCount > 0 && (
              <Badge variant="destructive" data-testid="badge-unread-count">
                {unreadCount} unread
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="outline"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-4 w-4 mr-2" />
                Mark All Read
              </Button>
            )}
            <Dialog open={newMessageOpen} onOpenChange={setNewMessageOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-message">
                  <Plus className="h-4 w-4 mr-2" />
                  New Message
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send Message</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {connections.length === 0 ? (
                    <div className="text-center py-6">
                      <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground mb-4">
                        No connected households yet. Connect with family to start messaging.
                      </p>
                      <Link href="/settings">
                        <Button variant="outline" data-testid="link-connect-settings">
                          Go to Settings
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Send to</label>
                        <Select value={selectedRecipient} onValueChange={setSelectedRecipient}>
                          <SelectTrigger data-testid="select-recipient">
                            <SelectValue placeholder="Select household" />
                          </SelectTrigger>
                          <SelectContent>
                            {connections.map((conn) => (
                              <SelectItem key={conn.id} value={conn.id}>
                                {conn.homeName || conn.username}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Message</label>
                        <Textarea
                          value={messageContent}
                          onChange={(e) => setMessageContent(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                              e.preventDefault();
                              if (selectedRecipient && messageContent.trim() && !sendMessageMutation.isPending) {
                                handleSendMessage();
                              }
                            }
                          }}
                          placeholder="Type your message..."
                          rows={4}
                          data-testid="input-message-content"
                        />
                        <p className="text-xs text-muted-foreground/50">Press Cmd+Enter to send</p>
                      </div>
                      <Button
                        className="w-full"
                        onClick={handleSendMessage}
                        disabled={!selectedRecipient || !messageContent.trim() || sendMessageMutation.isPending}
                        data-testid="button-send-message"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Send Message
                      </Button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {messages.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
              <h2 className="text-2xl font-medium mb-2">No Messages Yet</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Messages from your connected households will appear here. Start the conversation by sending a message.
              </p>
              {connections.length > 0 && (
                <Button onClick={() => setNewMessageOpen(true)} data-testid="button-send-first-message">
                  <Send className="h-4 w-4 mr-2" />
                  Send Your First Message
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
              <CardTitle className="text-lg">Inbox</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-320px)]">
                <div className="divide-y">
                  {messages.map((message) => {
                    const isSent = message.fromUserId === user?.id;
                    return (
                      <div
                        key={message.id}
                        className={`p-4 hover-elevate cursor-pointer ${!message.isRead && !isSent ? "bg-primary/5" : ""}`}
                        data-testid={`message-item-${message.id}`}
                        onClick={() => !isSent && handleReply(message)}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0 mt-1">
                            {isSent ? (
                              <ArrowUpRight className="h-5 w-5 text-muted-foreground" />
                            ) : message.isRead ? (
                              <MailOpen className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <Mail className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {isSent ? (
                                <>
                                  <Badge variant="outline" className="text-xs">Sent</Badge>
                                  <span className="font-medium" data-testid={`text-recipient-${message.id}`}>
                                    To: {message.toUsername}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="font-medium" data-testid={`text-sender-${message.id}`}>
                                    {message.fromUsername}
                                  </span>
                                  {!message.isRead && (
                                    <Badge variant="secondary" className="text-xs">New</Badge>
                                  )}
                                </>
                              )}
                              <span className="text-sm text-muted-foreground ml-auto">
                                {formatDate(message.createdAt)}
                              </span>
                            </div>
                            <p className="text-base whitespace-pre-wrap" data-testid={`text-message-${message.id}`}>
                              {message.content}
                            </p>
                            {message.linkedNoteId && (
                              <Link 
                                href="/notepad" 
                                className="text-primary text-sm mt-2 inline-block hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                View linked note
                              </Link>
                            )}
                          </div>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {!isSent && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleReply(message)}
                                data-testid={`button-reply-${message.id}`}
                                title="Reply"
                              >
                                <Reply className="h-4 w-4" />
                              </Button>
                            )}
                            {!message.isRead && !isSent && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => markReadMutation.mutate(message.id)}
                                data-testid={`button-mark-read-${message.id}`}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMessageMutation.mutate(message.id)}
                              data-testid={`button-delete-message-${message.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
