import {
  ArrowUpRight,
  CalendarCheck,
  ContactRound,
  Filter,
  Gauge,
  Moon,
  Radar,
  Search,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./actions";

export const dynamic = "force-dynamic";

const stats = [
  { label: "Lead qualificati", value: "0", detail: "Score minimo 50" },
  { label: "Da contattare", value: "0", detail: "Pronti per outreach" },
  { label: "Call prenotate", value: "0", detail: "Booking unico" },
  { label: "Pipeline stimata", value: "EUR 0", detail: "Valori configurabili" },
];

const pipeline = [
  "Nuovo",
  "Qualificato",
  "Da contattare",
  "Contattato",
  "Follow-up",
  "Call prenotata",
  "Cliente",
  "Scartato",
];

const categories = [
  "Hotel e agriturismi",
  "Centri estetici e spa",
  "Studi dentistici",
  "Fisioterapisti",
  "Location eventi",
  "Interior designer",
];

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email =
    typeof data?.claims?.email === "string"
      ? data.claims.email
      : "Utente Studio Radar";

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navigazione principale">
        <div className="brand">
          <span className="brand-mark">
            <Radar size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>Studio Radar</strong>
            <span>CRM lead intelligence</span>
          </div>
        </div>

        <nav className="nav-list">
          <a className="nav-item active" href="#">
            <Gauge size={18} aria-hidden="true" />
            Dashboard
          </a>
          <a className="nav-item" href="#">
            <ContactRound size={18} aria-hidden="true" />
            Lead
          </a>
          <a className="nav-item" href="#">
            <Search size={18} aria-hidden="true" />
            Ricerca
          </a>
          <a className="nav-item" href="#">
            <CalendarCheck size={18} aria-hidden="true" />
            Outreach
          </a>
          <a className="nav-item" href="#">
            <Settings size={18} aria-hidden="true" />
            Impostazioni
          </a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">MVP locale</p>
            <h1>Cruscotto operativo</h1>
          </div>
          <div className="topbar-actions">
            <span className="user-label">{email}</span>
            <button className="icon-button" type="button" aria-label="Tema chiaro">
              <Sun size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" aria-label="Tema scuro">
              <Moon size={18} aria-hidden="true" />
            </button>
            <button className="primary-button" type="button">
              <Search size={18} aria-hidden="true" />
              Nuova ricerca
            </button>
            <form action={logout}>
              <button className="secondary-button" type="submit">
                Esci
              </button>
            </form>
          </div>
        </header>

        <section className="stats-grid" aria-label="Metriche principali">
          {stats.map((stat) => (
            <article className="metric-card" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <p>{stat.detail}</p>
            </article>
          ))}
        </section>

        <section className="content-grid">
          <article className="panel panel-wide">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Pipeline</p>
                <h2>Stati commerciali</h2>
              </div>
              <button className="secondary-button" type="button">
                <Filter size={16} aria-hidden="true" />
                Filtri
              </button>
            </div>

            <div className="pipeline-list">
              {pipeline.map((status, index) => (
                <div className="pipeline-row" key={status}>
                  <span>{status}</span>
                  <div className="progress-track">
                    <div style={{ width: `${Math.max(8, 34 - index * 3)}%` }} />
                  </div>
                  <strong>0</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Targeting</p>
                <h2>Categorie prioritarie</h2>
              </div>
              <Sparkles size={20} aria-hidden="true" />
            </div>
            <div className="tag-list">
              {categories.map((category) => (
                <span className="tag" key={category}>
                  {category}
                </span>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Prossimo passo</p>
                <h2>Fondazioni tecniche</h2>
              </div>
              <ArrowUpRight size={20} aria-hidden="true" />
            </div>
            <ul className="check-list">
              <li>Supabase Auth e profili</li>
              <li>Schema lead con RLS</li>
              <li>Import CSV e deduplica</li>
              <li>Scoring Gemini/OpenAI astratto</li>
            </ul>
          </article>
        </section>
      </section>
    </main>
  );
}
