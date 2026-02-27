import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get Started — The Porch Health Park",
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-porch-cream">
      {children}
    </div>
  );
}
