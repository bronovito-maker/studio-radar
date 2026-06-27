import {
  CalendarCheck,
  ContactRound,
  Gauge,
  Radar,
  Search,
  Settings,
  Upload,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions";
import type { Viewer } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";

type AppShellProps = {
  active: "dashboard" | "leads" | "search" | "import" | "outreach" | "settings";
  eyebrow: string;
  title: string;
  viewer: Viewer;
  actions?: ReactNode;
  children: ReactNode;
};

const navigation = [
  { id: "dashboard", label: "Dashboard", href: "/", icon: Gauge, enabled: true },
  { id: "leads", label: "Lead", href: "/leads", icon: ContactRound, enabled: true },
  { id: "search", label: "Ricerca", href: "/search", icon: Search, enabled: false },
  { id: "import", label: "Importa", href: "/import", icon: Upload, enabled: false },
  { id: "outreach", label: "Outreach", href: "/outreach", icon: CalendarCheck, enabled: false },
  { id: "settings", label: "Impostazioni", href: "/settings", icon: Settings, enabled: false },
] as const;

export function AppShell({ active, eyebrow, title, viewer, actions, children }: AppShellProps) {
  const displayName = viewer.fullName || viewer.email;

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navigazione principale">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Radar size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>Studio Radar</strong>
            <span>CRM lead intelligence</span>
          </div>
        </Link>

        <nav className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;
            const className = `nav-item${active === item.id ? " active" : ""}${
              item.enabled ? "" : " disabled"
            }`;

            return item.enabled ? (
              <Link className={className} href={item.href} key={item.id}>
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </Link>
            ) : (
              <span className={className} aria-disabled="true" key={item.id} title="Disponibile nelle prossime fasi">
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </span>
            );
          })}
        </nav>

        <div className="sidebar-profile">
          <span className="avatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{displayName}</strong>
            <span>{viewer.role === "admin" ? "Amministratore" : "Collaboratore"}</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="page-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            {actions}
            <form action={logout}>
              <button className="secondary-button" type="submit">Esci</button>
            </form>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
