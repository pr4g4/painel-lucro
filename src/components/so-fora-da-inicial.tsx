"use client";
import { usePathname } from "next/navigation";
/** Renderiza os filhos em todas as páginas menos na inicial ("/"), onde a barra "Hoje" seria redundante. */
export function SoForaDaInicial({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <>{children}</>;
}
