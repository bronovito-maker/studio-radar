# Domande Aperte

Queste decisioni non bloccano la documentazione, ma vanno chiuse prima o durante le prime fasi di sviluppo.

## Brand

- Nome definitivo: Studio Radar.
- Tema visuale: chiaro operativo con supporto dark mode.

## Commerciale

- Quali prezzi definitivi usare per pipeline?
- Quali categorie sono prioritarie nelle prime scansioni?
- Aree geografiche iniziali: Emilia-Romagna, Toscana, Lombardia per ultima.

## Scoring

- Soglia iniziale impostata a 65, da tarare sulla qualita effettiva.
- Quanto peso dare a categoria, regione, recensioni, sito assente/presente?
- Modello OpenAI premium da valutare dopo gli eval: mantenere solo `gpt-5.4-mini` o usare `gpt-5.5` per i casi complessi.

## Operativita

- I collaboratori vedono tutti i lead nel MVP.
- Serve assegnazione manuale o automatica?
- Stati pipeline MVP confermati in forma semplificata.

## Compliance

- Quale testo privacy interno usare per gestione dati lead?
- Quali regole adottare per cancellazione o archiviazione lead?
- Quale procedura manuale seguire prima del contatto WhatsApp?

## Deploy

- Target iniziale: Render + Supabase.
- Dominio: `https://studio-radar.onrender.com`.
- Ambiente staging non necessario subito: local first, produzione quando il prodotto e pronto.
