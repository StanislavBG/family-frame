import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function PrivacyPage() {
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
            <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
            <p className="text-muted-foreground mb-8">Last updated: January 2026</p>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Introduction</h2>
              <p>
                Family Frame ("we", "our", or "us") is committed to protecting your privacy. 
                This Privacy Policy explains how we collect, use, and safeguard your information 
                when you use our application.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Information We Collect</h2>
              <p>We collect the following types of information:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li>
                  <strong>Account Information:</strong> When you sign up, we collect your email address 
                  and name through our authentication provider (Clerk).
                </li>
                <li>
                  <strong>Google Photos Data:</strong> When you connect Google Photos, we access your 
                  shared albums to display photos on your family frame. We only access albums you 
                  explicitly select.
                </li>
                <li>
                  <strong>Location Data:</strong> You may optionally provide location information to 
                  display weather for your household.
                </li>
                <li>
                  <strong>Calendar Events:</strong> Events you create are stored to display on your 
                  family calendar.
                </li>
                <li>
                  <strong>Household Members:</strong> Names and birthdays of household members you add.
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">How We Use Your Information</h2>
              <p>We use your information to:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li>Display your photos on the family frame slideshow</li>
                <li>Show weather information for your location</li>
                <li>Display your family calendar and events</li>
                <li>Connect you with other family members using the app</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Data Storage</h2>
              <p>
                Your data is stored securely using Firebase Realtime Database. We use industry-standard 
                security measures to protect your information. Your Google Photos are not stored by us - 
                we only access them in real-time when displaying your slideshow.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Third-Party Services</h2>
              <p>We use the following third-party services:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li><strong>Clerk:</strong> For user authentication</li>
                <li><strong>Google Photos API:</strong> To access your selected photo albums</li>
                <li><strong>Open-Meteo:</strong> For weather data (no personal data shared)</li>
                <li><strong>Firebase:</strong> For secure data storage</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Data Sharing</h2>
              <p>
                We do not sell your personal information. Your data is only shared with connected 
                family members as you choose, and with the third-party services listed above as 
                necessary to provide our service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Your Rights</h2>
              <p>You have the right to:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li>Access your personal data</li>
                <li>Delete your account and all associated data</li>
                <li>Disconnect Google Photos at any time</li>
                <li>Remove household members and events</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Google API Services User Data Policy</h2>
              <p>
                Family Frame's use and transfer of information received from Google APIs adheres to the{" "}
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
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy, please contact us through the app 
                or reach out to the app developer.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
