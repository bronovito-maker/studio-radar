# Studio Radar

Base documentale per un CRM B2B moderno dedicato a lead generation, qualificazione AI e gestione pipeline per servizi digitali.

Il progetto parte da un'idea simile a un "GlobalLead CRM", ma viene ripensato con un perimetro piu piccolo, piu sicuro e piu sostenibile: prima il cuore operativo, poi le integrazioni avanzate.

## Obiettivo

Costruire uno strumento interno che aiuti a:

- scoprire potenziali clienti B2B per categoria e area geografica;
- deduplicare e qualificare i lead con regole deterministiche e AI;
- gestire stati, note, valore stimato e follow-up;
- preparare messaggi WhatsApp manuali e tracciati;
- mantenere audit, sicurezza e qualita tecnica fin dal primo giorno.

## Documentazione

- [Visione prodotto](docs/product-brief.md)
- [Scope MVP](docs/mvp-scope.md)
- [Architettura](docs/architecture.md)
- [Modello dati](docs/data-model.md)
- [Sicurezza e compliance](docs/security.md)
- [Integrazioni](docs/integrations.md)
- [Scoring AI](docs/ai-scoring.md)
- [Prezzi iniziali](docs/pricing.md)
- [Targeting iniziale](docs/targeting.md)
- [UX e design system](docs/ux-design.md)
- [Roadmap](docs/roadmap.md)
- [Piano di sviluppo](docs/development-plan.md)
- [Definition of Done](docs/definition-of-done.md)
- [Standard tecnici](docs/technical-standards.md)
- [Variabili ambiente](docs/env-vars.md)
- [Setup Supabase](docs/supabase-setup.md)
- [Stato del progetto](docs/project-status.md)
- [Domande aperte](docs/open-questions.md)
- [Decisioni architetturali](docs/adr)

## Principi guida

- Automazione utile, non cieca.
- AI tracciabile, versionata e verificabile.
- Sicurezza by default: nessuna API pubblica non protetta.
- MVP compatto: meno integrazioni, piu affidabilita.
- Debito tecnico esplicito: ogni scorciatoia va documentata o evitata.

## Stato

Documentazione, fondazioni tecniche, CRM core, import CSV e score deterministico completati. Discovery e shortlist Google Places sono operative; il prossimo blocco e l'arricchimento verificato da fonte indipendente prima della creazione del lead.

Il dettaglio verificabile, i lavori aperti e la prossima milestone sono tracciati nello [stato del progetto](docs/project-status.md).
