import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set Up Your PIN — AI Restaurant Manager",
};

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-porch-cream flex items-center justify-center px-4">
      {children}
    </div>
  );
}
