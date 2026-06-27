# Scoring AI

## Obiettivo

Prioritizzare i lead piu promettenti, spiegando il motivo dello score.

Lo scoring non deve essere opaco: ogni valutazione deve essere tracciabile e ricalcolabile.

## Strategia

### 1. Score deterministico - implementato

Versione corrente: `deterministic-v2026.06.27-1`.

E calcolato senza AI, quindi e economico, spiegabile e perfettamente ripetibile. Ogni esecuzione viene salvata nello storico `lead_scores`; il record precedente non viene sovrascritto.

Pesi correnti:

- base attivita: `+15`;
- categoria ad alto valore: `+16`; categoria media: `+10`; categoria assente: `-5`;
- Emilia-Romagna: `+12`; Toscana: `+8`; Lombardia: `+3`;
- sito assente: `+18`; sito presente: `+4`;
- rating almeno 4,2 con almeno 30 recensioni: `+16`;
- rating almeno 4 con almeno 10 recensioni: `+10`;
- almeno 5 recensioni: `+4`; nessuna recensione: `-6`;
- rating inferiore a 3,5: `-10`;
- telefono presente: `+6`; assente: `-5`; email presente: `+3`;
- booking assente in una categoria prenotabile: `+7`;
- attivita temporaneamente chiusa: `-20`; definitivamente chiusa: score `0`.

Il risultato e sempre limitato tra 0 e 100. A parita di input, output e motivazione restano identici.

### 2. Score AI

Usato per:

- sintetizzare motivazione;
- suggerire servizio;
- ridurre falsi positivi;
- evidenziare segnali non banali nei dati disponibili.

## Provider AI

Decisione aperta tra Gemini e OpenAI. Non blocca l'MVP: l'AI sara un secondo livello di analisi, mai la fonte primaria dello score.

Nel codice il provider deve restare astratto, cosi da poter cambiare modello senza riscrivere lo scoring.

## Output richiesto

```json
{
  "score": 72,
  "grade": "hot",
  "recommended_service": "restyling-sito",
  "reasoning": "Attivita con molte recensioni, sito presente ma migliorabile e mercato locale adatto.",
  "positive_signals": ["review_count_high", "target_area"],
  "negative_signals": ["website_present"],
  "confidence": 0.78
}
```

## Soglie iniziali

- 0-39: freddo, non prioritario.
- 40-59: tiepido, da valutare.
- 60-79: buono, da contattare.
- 80-100: prioritario.

La soglia di qualifica iniziale e 50, configurabile in `settings.default_score_threshold`. Un lead nello stato `new` che supera la soglia passa a `qualified`; gli altri stati non vengono modificati automaticamente.

La strategia commerciale e "pochi lead ma buoni": lo scoring deve privilegiare precisione e qualita rispetto alla quantita.

## Guardrail

- Se output AI non e JSON valido, non aggiornare score AI.
- Se confidenza bassa, mostra warning in UI.
- Non cancellare score storici.
- Non usare AI per inventare dati mancanti.
- Non contattare automaticamente in base allo score.

## Versionamento

Formato:

```text
deterministic-vYYYY.MM.DD-N
```

Esempio:

```text
deterministic-v2026.06.27-1
```
