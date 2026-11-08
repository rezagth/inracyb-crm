import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "InfraCyb CRM", template: "%s · InfraCyb CRM" },
  description: "Système de gestion d'entreprise interne d'InfraCyb",
  robots: { index: false, follow: false },
};

// Applique le thème avant l'affichage pour éviter un flash (clair par défaut, sombre si choisi ou si le système le demande).
const themeScript = `try{var t=localStorage.getItem('icrm-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
