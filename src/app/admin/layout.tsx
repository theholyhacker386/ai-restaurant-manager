export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin header */}
      <header className="bg-porch-brown text-white px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">AI Restaurant Manager</h1>
          <p className="text-xs text-white/70">Platform Admin</p>
        </div>
        <a
          href="/api/auth/signout"
          className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
        >
          Sign Out
        </a>
      </header>

      {/* Nav */}
      <nav className="bg-porch-brown border-t border-white/10 px-4 py-2 flex gap-4">
        <a href="/admin" className="text-sm text-white/80 hover:text-white transition-colors">Restaurants</a>
        <a href="/admin/settings" className="text-sm text-white/80 hover:text-white transition-colors">Settings</a>
      </nav>

      {/* Content */}
      <main className="max-w-4xl mx-auto p-4">
        {children}
      </main>
    </div>
  );
}
