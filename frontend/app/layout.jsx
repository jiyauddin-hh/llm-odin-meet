import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: { default: "Quantum Code — Practice coding, master DSA & ML", template: "%s · Quantum Code" },
  description:
    "Solve hand-picked coding problems with instant judging, learn Python, C++, DSA and Machine Learning step by step, and climb the leaderboard.",
  applicationName: "Quantum Code",
  keywords: ["coding practice", "DSA", "machine learning", "online judge", "leaderboard", "courses"],
  openGraph: { title: "Quantum Code", description: "Practice coding, master DSA & ML.", type: "website" },
};

export const viewport = {
  themeColor: "#07080f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-full flex-col">
        {/* Ambient background: soft aurora glow plus a faint grid, fixed behind everything. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-aurora" />
          <div className="absolute inset-0 bg-grid-fade bg-grid opacity-60 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        </div>
        <AuthProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
