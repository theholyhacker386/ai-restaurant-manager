import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Personal Onboarding Manager — AI Restaurant Manager",
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
