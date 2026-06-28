# Scoring commerciale V2

## Obiettivo

Lo scoring di Studio Radar non misura il valore assoluto di un'azienda. Trasforma dati verificabili in una decisione commerciale:

- quale offerta e valutabile;
- quanto vale la pena approfondirla;
- quanto sono complete le prove;
- quale azione deve compiere l'operatore.

La strategia resta "pochi lead ma buoni": precisione e trasparenza hanno priorita sulla quantita.

## Principi

1. Ogni offerta ha uno score separato.
2. `0` significa offerta valutata e non adatta; `null` significa non valutabile con i dati disponibili.
3. `opportunityScore` e il massimo tra gli score offerta eleggibili.
4. `confidence` misura la copertura delle prove e non aumenta l'opportunita.
5. OpenAI spiega le evidenze ma non modifica score, offerta o prossima azione.
6. Ogni esecuzione e deterministica, versionata e conserva il proprio input snapshot.
7. Le attivita chiuse e i segnali insufficienti attivano limiti espliciti, non compensazioni arbitrarie.

## Contratto V2

```ts
type OfferScore = number | null;

type ScoringV2 = {
  version: "deterministic-v2026.06.28-3";
  opportunityScore: number;
  confidence: number;
  grade: "cold" | "warm" | "hot" | "priority";
  offerScores: {
    siteNew: OfferScore;
    websiteRedesign: OfferScore;
    booking: OfferScore;
    automation: OfferScore;
    ads: null;
    branding: null;
  };
  recommendation: {
    service: "sito-nuovo" | "restyling-sito" | "booking-conversione" | "automazioni" | null;
    nextAction: "contact_now" | "manual_verify" | "enrich_data" | "ignore";
  };
  components: {
    businessViability: number;
    contactability: number;
    commercialSafety: number;
    digitalEvidenceCompleteness: number;
  };
  evidence: string[];
  unknowns: string[];
  reasoning: string;
};
```

Nel database vengono materializzati soltanto i campi gia esistenti e necessari alle viste operative:

- `lead_scores.score` riceve `opportunityScore`;
- `lead_scores.confidence` riceve `confidence / 100`;
- `lead_scores.recommended_service_id` riceve l'offerta consigliata;
- `lead_scores.input_snapshot.scoringV2` conserva il contratto completo;
- `lead_scores.input_snapshot.input` conserva gli input originali.

Non vengono aggiunte colonne per i singoli offer score finche non esiste un uso frequente e misurato nei filtri.

## Dati e stati di conoscenza

L'assenza di un valore non equivale a una verifica negativa. In particolare il sito usa tre stati:

- `verified_present`: URL ufficiale disponibile;
- `not_detected`: la fonte interrogata non ha restituito un sito, ma l'assenza puo richiedere conferma manuale;
- `unknown`: nessuna verifica affidabile completata.

Un lead Google Places senza URL puo ricevere uno score prudenziale per `siteNew`, ma confidence e next action devono impedire il contatto immediato quando l'assenza non e stata confermata.

## Componenti

I componenti sono normalizzati tra 0 e 100 e non vengono sommati direttamente per ottenere l'opportunita generale.

### Business viability

Usa soltanto:

- stato operativo;
- categoria commerciale;
- volume recensioni;
- rating, pesato insieme al volume.

Il numero di recensioni usa fasce non lineari. Un rating alto con poche recensioni non equivale a una reputazione consolidata.

### Contactability

- telefono disponibile: 55 punti;
- email disponibile: 45 punti.

La disponibilita non implica che il contatto sia stato verificato sul sito ufficiale; questo limite ricade sulla confidence.

### Commercial safety

Valuta in modo prudente:

- stato operativo;
- rating non problematico;
- identita digitale disponibile;
- presenza di almeno un contatto.

Non stima budget, ricchezza, decisore o propensione all'acquisto.

### Digital evidence completeness

Misura la copertura delle prove:

- stato attivita;
- reputazione;
- verifica presenza sito;
- contatti;
- analisi digitale;
- fonte ufficiale.

Questo componente coincide con la base della confidence deterministica.

## Score per offerta

### Sito nuovo

- attivita chiusa: `0`;
- presenza sito sconosciuta: `null`;
- sito verificato presente: `0`;
- sito non rilevato: score pesato e prudenziale;
- viability sotto 35: massimo 45;
- contactability sotto 30: massimo 55.

### Restyling sito

- attivita chiusa: `0`;
- sito sconosciuto: `null`;
- sito non presente: `0`;
- sito presente ma non analizzato: `null`;
- analisi completata senza gap sufficiente: `0`;
- gap tecnico documentato: score deterministico.

La prima release non deduce debolezze tecniche dalla sola esistenza del sito. Senza un'analisi strutturata, il valore resta `null`.

### Booking e conversione

- categoria non pertinente: `0`;
- stato booking sconosciuto: `null`;
- booking gia disponibile: `0`;
- assenza booking osservata: score deterministico;
- viability e contactability applicano gli stessi limiti prudenziali.

### Automazioni

- viability sotto 60: `0`;
- categoria non pertinente: `0`;
- assenza di una presenza digitale minima: `0`;
- potenziale di automazione non documentato: `null`;
- potenziale documentato: score deterministico.

### Ads e branding

Restano sempre `null` nella V2. Non esistono ancora segnali sufficientemente affidabili per valutarli.

## Opportunity, grade e prossima azione

```text
opportunityScore = max(score offerta non-null)
```

Se nessuna offerta e eleggibile, il risultato e `0` e il servizio consigliato e `null`.

Grade:

- `0-39`: cold;
- `40-64`: warm;
- `65-79`: hot;
- `80-100`: priority.

Next action:

- score sotto 40: `ignore`;
- confidence sotto 60: `enrich_data`;
- confidence tra 60 e 74: `manual_verify`;
- contactability sotto 35: `manual_verify`;
- altrimenti: `contact_now`.

La qualifica automatica richiede sia la soglia configurata sia `nextAction = contact_now`. Uno score alto ma poco affidabile non deve rendere il lead immediatamente contattabile.

## Ruolo di OpenAI

OpenAI usa Responses API, Structured Outputs e fonti limitate al dominio ufficiale. Puo:

- sintetizzare evidenze osservabili;
- spiegare opportunita e rischi;
- produrre un sales angle;
- evidenziare informazioni mancanti.

Non puo:

- produrre un AI score;
- cambiare gli offer score;
- scegliere il servizio salvato;
- cambiare `nextAction`;
- qualificare o contattare automaticamente un lead.

L'interpretazione viene salvata nello stesso snapshot dello score deterministico, con modello, prompt version, response ID e fonti validate. L'output strutturato viene definito in Zod per evitare divergenza tra schema API e tipi applicativi.

## UI operativa

La scheda lead mostra:

- opportunity score e confidence;
- offerta consigliata;
- prossima azione;
- quattro componenti;
- score delle offerte valutabili;
- evidenze e dati mancanti;
- interpretazione OpenAI separata dai numeri.

La discovery ordina i risultati per opportunity score decrescente. I risultati con confidence insufficiente devono essere presentati come da verificare, non come lead pronti al contatto.

## Validazione futura

La V2 resta un'euristica finche non viene calibrata sui risultati commerciali. Vanno raccolti almeno:

- offerta proposta;
- canale di contatto;
- risposta;
- appuntamento;
- vendita e valore;
- motivo del rifiuto.

I pesi non devono essere modificati sulla base di impressioni isolate. Le revisioni richiedono un nuovo identificatore di versione e test di regressione su casi rappresentativi.

## Guardrail

- Non trasformare `unknown` in assenza.
- Non trasformare `null` in `0`.
- Non cancellare lo storico score.
- Non usare OpenAI come fonte numerica.
- Non contattare automaticamente.
- Non aggiungere colonne finche il query pattern non e stabile.
- Conservare input, versione, evidenze e motivazione per ogni esecuzione.
