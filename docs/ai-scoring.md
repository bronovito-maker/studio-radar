# Scoring AI

## Obiettivo

Prioritizzare i lead piu promettenti, spiegando il motivo dello score.

Lo scoring non deve essere opaco: ogni valutazione deve essere tracciabile e ricalcolabile.

## Strategia

### 1. Score deterministico

Calcolato senza AI, economico e ripetibile.

Esempi di segnali:

- sito assente: opportunita sito nuovo;
- sito presente: opportunita restyling o automazioni;
- numero recensioni alto: business attivo;
- rating buono: business sano;
- categoria ad alto valore: priorita maggiore;
- area geografica target: priorita maggiore;
- telefono disponibile: contattabilita;
- booking assente/presente: opportunita automazione o conversione.

### 2. Score AI

Usato per:

- sintetizzare motivazione;
- suggerire servizio;
- ridurre falsi positivi;
- evidenziare segnali non banali nei dati disponibili.

## Provider

Decisione aperta tra Gemini e OpenAI.

Nel codice il provider deve restare astratto, cosi da poter cambiare modello senza riscrivere lo scoring.

## Output richiesto

```json
{
  "score": 72,
  "grade": "hot",
  "recommended_service": "restyling",
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

La soglia di import/qualifica iniziale e 50, configurabile.

La strategia commerciale e "pochi lead ma buoni": lo scoring deve privilegiare precisione e qualita rispetto alla quantita.

## Guardrail

- Se output AI non e JSON valido, non aggiornare score AI.
- Se confidenza bassa, mostra warning in UI.
- Non cancellare score storici.
- Non usare AI per inventare dati mancanti.
- Non contattare automaticamente in base allo score.

## Versionamento prompt

Formato:

```text
lead-scoring-vYYYY.MM.DD-N
```

Esempio:

```text
lead-scoring-v2026.06.26-1
```
