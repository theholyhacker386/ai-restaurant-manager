import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login — The Porch Health Park",
};

export default function LoginLayout({
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
