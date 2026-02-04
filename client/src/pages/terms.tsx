import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto">
        <Button variant="ghost" asChild className="mb-6">
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Link>
        </Button>

        <Card>
          <CardContent className="p-8 prose prose-neutral dark:prose-invert max-w-none">
            <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
            <p className="text-muted-foreground mb-8">Last updated: January 2026</p>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">1. Acceptance of Terms</h2>
              <p>
                By accessing and using Family Frame ("the Service"), you agree to be bound by these 
                Terms of Service. If you do not agree to these terms, please do not use the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">2. Description of Service</h2>
              <p>
                Family Frame is a Progressive Web Application designed to transform smart screens 
                into a dedicated social network for households. The Service provides:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li>Digital photo frame functionality using Google Photos</li>
                <li>Weather display for family locations</li>
                <li>Shared family calendar</li>
                <li>Household member management</li>
                <li>Connection with other family members</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">3. User Accounts</h2>
              <p>
                To use the Service, you must create an account. You are responsible for maintaining 
                the confidentiality of your account credentials and for all activities that occur 
                under your account.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">4. Google Photos Integration</h2>
              <p>
                The Service integrates with Google Photos to display your photos. By connecting 
                your Google account:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li>You authorize us to access your shared photo albums</li>
                <li>We will only access albums you explicitly select</li>
                <li>Your photos are displayed in real-time and are not stored by us</li>
                <li>You can disconnect Google Photos at any time through Settings</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">5. User Content</h2>
              <p>
                You retain ownership of all content you provide to the Service, including:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li>Calendar events you create</li>
                <li>Household member information</li>
                <li>Settings and preferences</li>
              </ul>
              <p className="mt-2">
                You are responsible for ensuring you have the right to share any information 
                you add about household members.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">6. Acceptable Use</h2>
              <p>You agree not to:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li>Use the Service for any unlawful purpose</li>
                <li>Attempt to gain unauthorized access to the Service</li>
                <li>Interfere with or disrupt the Service</li>
                <li>Share accounts with unauthorized users</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">7. Service Availability</h2>
              <p>
                We strive to maintain reliable service but do not guarantee uninterrupted access. 
                The Service may be temporarily unavailable for maintenance or updates.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">8. Limitation of Liability</h2>
              <p>
                The Service is provided "as is" without warranties of any kind. We are not liable 
                for any indirect, incidental, or consequential damages arising from your use of 
                the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">9. Changes to Terms</h2>
              <p>
                We may update these Terms from time to time. Continued use of the Service after 
                changes constitutes acceptance of the new terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">10. Termination</h2>
              <p>
                You may stop using the Service at any time. We reserve the right to suspend or 
                terminate accounts that violate these Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">11. Contact</h2>
              <p>
                For questions about these Terms, please contact us through the app or reach out 
                to the app developer.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
