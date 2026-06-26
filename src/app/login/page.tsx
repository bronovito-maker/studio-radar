import { Radar } from "lucide-react";
import { login } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand login-brand">
          <span className="brand-mark">
            <Radar size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>Studio Radar</strong>
            <span>CRM lead intelligence</span>
          </div>
        </div>

        <div className="login-copy">
          <p className="eyebrow">Accesso riservato</p>
          <h1>Bentornato</h1>
          <p>Accedi al cruscotto operativo e alla pipeline commerciale.</p>
        </div>

        <form className="login-form" action={login}>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button login-submit" type="submit">
            Accedi
          </button>
        </form>
      </section>
    </main>
  );
}

