import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Painel de Lucro", description: "Lucro líquido em tempo quase real" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const temaScript = `try{var t=localStorage.getItem('tema');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: temaScript }} /></head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
