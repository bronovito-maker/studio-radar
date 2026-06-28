# Scoring AI

## Obiettivo

Prioritizzare i lead piu promettenti, spiegando il motivo dello score.

Lo scoring non deve essere opaco: ogni valutazione deve essere tracciabile e ricalcolabile.

## Strategia

### 1. Score deterministico - implementato

Versione corrente: `deterministic-v2026.06.28-2`.

E calcolato senza AI, quindi e economico, spiegabile e perfettamente ripetibile. Ogni esecuzione viene salvata nello storico `lead_scores`; il record precedente non viene sovrascritto.

Componenti correnti:

- coerenza mercato, massimo `30`: categoria e priorita geografica;
- solidita attivita, massimo `25`: stato operativo e reputazione verificabile;
- opportunita digitale, massimo `30`: sito assente o da analizzare e gap booking;
- contattabilita, massimo `15`: telefono ed email disponibili.

Un sito presente ma non ancora analizzato riceve solo un valore prudenziale. Il booking non verificato non viene interpretato come assente. Un'attivita temporaneamente chiusa non puo superare 35; una definitivamente chiusa riceve 0.

Il risultato e sempre limitato tra 0 e 100. A parita di input, output e motivazione restano identici.

### 2. Analisi AI OpenAI - implementata

Usato per:

- cercare contenuti esclusivamente nel dominio del sito ufficiale;
- sintetizzare punti di forza e opportunita digitali;
- suggerire il servizio con prove esplicite;
- preparare un angolo outreach consulenziale;
- evidenziare dati mancanti invece di inventarli.

## Provider AI scelto

OpenAI tramite Responses API e Structured Outputs. Il modello iniziale e `gpt-5.4-mini`, configurabile con `AI_SCORING_MODEL`; `gpt-5.5` resta disponibile per analisi premium o casi complessi.

Versione prompt corrente: `website-assessment-v2026.06.28-2`.

L'analisi viene avviata manualmente dalla scheda lead. La ricerca web OpenAI riceve un filtro `allowed_domains` contenente soltanto il dominio ufficiale; directory, social, mappe e recensioni esterne sono escluse. Ogni opportunita deve includere un URL fonte, nuovamente validato dal server prima del salvataggio.

L'AI resta un secondo livello controllato: non crea lead, non cambia autonomamente i dati anagrafici e non invia messaggi.

OpenAI prepara inoltre bozze outreach usando soltanto dati ed evidenze gia salvati nel CRM. La bozza e modificabile, non contiene il booking link generato dal modello e non aggiorna lo stato del lead finche l'operatore non registra manualmente il contatto.

## Score ibrido

Versione corrente: `hybrid-v2026.06.28-1`.

OpenAI entra nel punteggio finale soltanto quando:

- la confidenza e almeno 0,60;
- esiste almeno un'opportunita con evidenza esplicita dal sito ufficiale.

Il peso AI varia dal 39% al 45% in base alla confidenza; il resto rimane deterministico. Se le prove non sono sufficienti, il peso AI e 0 e lo score base resta invariato. Il servizio consigliato dall'AI prevale solo con confidenza almeno 0,70.

## Output richiesto

```json
{
  "summary": "Presenza digitale attiva con opportunita nel percorso di conversione.",
  "advisoryScore": 72,
  "recommendedService": "booking-conversione",
  "confidence": 0.78,
  "opportunities": [],
  "risks": [],
  "missingEvidence": [],
  "outreachAngle": "Proporre una verifica consulenziale del percorso di prenotazione.",
  "sources": ["https://azienda.example/prenotazioni"]
}
```

## Soglie iniziali

- 0-44: freddo, non prioritario.
- 45-64: tiepido, da valutare.
- 65-79: buono, da contattare.
- 80-100: prioritario.

La soglia di qualifica e 65, configurabile in `settings.default_score_threshold`. Un lead nello stato `new` che raggiunge la soglia passa a `qualified`; gli altri stati non vengono modificati automaticamente.

La strategia commerciale e "pochi lead ma buoni": lo scoring deve privilegiare precisione e qualita rispetto alla quantita.

## Guardrail

- Se output AI non e JSON valido, non aggiornare score AI.
- Se una fonte non appartiene al dominio ufficiale, scartare l'intera analisi.
- Se confidenza bassa, mostra warning in UI.
- Non cancellare score storici.
- Non usare AI per inventare dati mancanti.
- Non contattare automaticamente in base allo score.
- Non eseguire analisi batch finche qualita e costo del flusso manuale non sono misurati.

## Versionamento

Formato:

```text
deterministic-vYYYY.MM.DD-N
```

Esempio:

```text
deterministic-v2026.06.28-2
```
