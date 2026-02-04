import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-8">
      <Card className="max-w-md w-full">
        <CardContent className="p-12 text-center">
          <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-6">
            <Home className="h-10 w-10 text-muted-foreground" />
          </div>
          <h1 className="text-6xl font-bold mb-2 text-foreground" data-testid="text-404">404</h1>
          <h2 className="text-xl font-semibold mb-4">Page Not Found</h2>
          <p className="text-muted-foreground mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Button asChild size="lg" data-testid="button-go-home">
            <Link href="/">
              <ArrowLeft className="h-5 w-5 mr-2" />
              Go to Home
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
