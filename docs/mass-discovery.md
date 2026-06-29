# Mass Discovery & Auto-Outreach

> Architettura del flusso di lead generation massiva con approvazione manuale.

## Obiettivo

Trovare fino a 50 potenziali clienti B2B ogni notte, estrarre automaticamente contatti reali dai loro siti web, qualificarli con scoring deterministico, e preparare email di outreach — **senza mai inviare automaticamente**. L'invio richiede l'approvazione esplicita di un admin la mattina seguente.

## Principi di sicurezza e compliance

1. **Nessun invio automatico di massa.** Il cron prepara le email in stato `queued`. Solo un admin autenticato può attivare l'invio tramite pulsante dedicato.
2. **Anti-ban Brevo.** Invio con delay di 1.5 secondi tra email, rispetto del limite giornaliero configurabile, stop immediato su risposta 429 (rate limit).
3. **Opt-out obbligatorio.** Ogni email include il footer "Se non desidera ricevere altri messaggi, risponda a questa email e non la contatteremo più."
4. **Dati pubblici.** Il web scouting estrae solo informazioni già visibili pubblicamente sui siti web aziendali.
5. **Nessun dato Places persistito come dato CRM.** I risultati Google Places sono effimeri (ADR 0005). Il lead viene creato solo dopo uno scouting riuscito: nome, contatti e segnali derivano dal sito ufficiale; città, regione e categoria derivano dal contesto di ricerca.
6. **Nessuna automazione AI irreversibile.** OpenAI non modifica score, offerta o next action (ADR 0003). Il template email è deterministico.

## Flusso completo

```
03:00 UTC — Supabase Cron → GET /api/cron/discovery
│
├─ FASE 1 — Discovery (Google Places batch search)
│   searchGooglePlacesBatch(categoria, città, regione, targetCount: 50)
│   ├─ Query base: "hotel a Bologna, Emilia-Romagna" → 20 risultati
│   ├─ Query centro: "hotel centro Bologna, Emilia-Romagna" → 20 risultati
│   ├─ Query zona: "hotel zona Bologna, Emilia-Romagna" → 20 risultati
│   ├─ Dedup per Place ID → 50 risultati unici
│   └─ Filtro: esclude Place ID già presenti in leads o lead_candidates
│
├─ FASE 2 — Shortlist
│   Inserisce nuovi Place ID in lead_candidates (origin: "cron")
│
├─ FASE 3 — Web Scouting + Auto-conversione + Scoring
│   Per ogni nuovo Place:
│   ├─ scoutWebsite(websiteUrl) → WebScoutResult
│   │   ├─ Estrae email reali (qualità high/medium/low)
│   │   ├─ Estrae telefoni (mobile/fisso IT)
│   │   ├─ Rileva booking (provider, visibilità)
│   │   ├─ Rileva WhatsApp, chatbot concorrenti
│   │   ├─ Rileva canali social (Facebook, Instagram, LinkedIn, TikTok)
│   │   └─ Rileva sedi multiple (indirizzi)
│   ├─ auto_create_lead_from_place(dati sito + contesto ricerca) → lead con deduplica atomica
│   ├─ scoreLead(dati arricchiti) → deterministico V2
│   ├─ save_automated_deterministic_score() → persistenza service-role con audit admin
│   └─ Salva note lead con riepilogo scouting
│
├─ FASE 4 — Coda email (SOLO preparazione, NO invio)
│   Per lead con:
│   ├─ Email reale estratta dal sito (non info@ indovinata)
│   ├─ Senza chatbot concorrente (non già servito da competitor)
│   ├─ Score ≥ soglia configurata e nextAction = contact_now
│   └─ Inserisce in email_messages (status: "queued", kind: "initial")
│
└─ Response: found, shortlisted, converted, scouted, queued
```

```
08:00 — Admin apre /outreach
│
├─ Vede badge con conteggio email in coda
├─ Controlla i nuovi lead nella lista CRM
├─ Clicca "Approva e invia {N} email"
│
└─ sendQueuedEmailsAction():
    ├─ Claim atomico sotto lock e verifica limite giornaliero (email_daily_limit)
    ├─ Per ogni email in coda:
    │   ├─ Messaggio già riservato (status: queued → sending)
    │   ├─ Verifica lead ancora contattabile
    │   ├─ sendBrevoEmail() → Brevo API
    │   ├─ record_email_sent() → audit + follow-up
    │   ├─ Delay 1.5s (anti-ban)
    │   └─ Stop immediato su 429 (rate limit Brevo)
    └─ Redirect con conteggio: inviate, fallite, saltate
```

```
07:00 UTC — Supabase Cron → GET /api/cron/email-followups
│
├─ Recupera email follow-up in coda (kind: "follow_up", scheduled_for <= now)
├─ Stessi controlli anti-ban del flusso manuale
└─ Stop automatico su bounce, disiscrizione o risposta registrata
```

## Moduli coinvolti

### `src/lib/places/client.ts` — Google Places batch search
- `searchGooglePlacesBatch()`: query multiple con sub-area modifiers
- Max 20 risultati per chiamata (limite Google API)
- 5 formulazioni di query: base, centro, zona, provincia, vicino
- Dedup automatico per Place ID tra le query
- Fallback graceful: se quota esaurita, restituisce i risultati già raccolti

### `src/lib/web-scout.ts` — Web crawling (NUOVO)
- Zero dipendenze esterne: solo `fetch()` nativo + regex
- Crawla homepage + fino a 2 sottopagine sullo stesso dominio (/contatti, /prenota, /chi-siamo, /sedi)
- Timeout 6s homepage / 3s sottopagina, max effettivo 300KB HTML letto in streaming
- Blocca protocolli non HTTP, credenziali URL, redirect, localhost e indirizzi privati/link-local
- User-Agent dichiarato: "StudioRadar/1.0 (B2B lead research)"
- Output strutturato: `WebScoutResult` con email, telefoni, booking, WhatsApp, chatbot, social, sedi

### `src/lib/web-scout-utils.ts` — Sicurezza rete e concorrenza
- `isPrivateIpAddress(address)`: blocca localhost, RFC1918, link-local, carrier-grade NAT, unique local IPv6
- `mapWithConcurrency(items, limit, fn)`: esegue fetch in parallelo con limite di concorrenza configurabile
- Test coperti: 12 test in `src/lib/web-scout.test.ts`

### RPC PostgreSQL — Nuove funzioni
- `auto_create_lead_from_place()`: creazione lead con deduplica atomica (service_role only)
- `save_automated_deterministic_score()`: wrapper per `save_deterministic_score` compatibile con admin client
- `claim_queued_initial_emails()`: prenotazione atomica email con lock sulla riga settings — impedisce sforamento del limite giornaliero anche con admin concorrenti

### `src/app/api/cron/discovery/route.ts` — Cron endpoint
- Protetto da `Authorization: Bearer <CRON_SECRET>`
- Lock concorrente su `scan_runs` (max 1 run alla volta)
- Stale lock cleanup dopo 30 minuti
- Usa `createAdminClient()` (service_role) per le operazioni database
- RPC `auto_create_lead_from_place()` per creazione lead con deduplica atomica

### `src/app/leads/actions.ts` — Azioni server
- `sendQueuedEmailsAction()`: invio batch con anti-ban
- Solo admin può eseguire
- Delay 1.5s tra invii, stop su rate limit, rispetto limite giornaliero

### `src/app/outreach/page.tsx` — UI
- Server Component che mostra conteggio email in coda
- Pulsante "Approva e invia" visibile solo agli admin
- Feedback tramite searchParams (error/success)

## Configurazione

Tutte le soglie sono configurabili dalla pagina Impostazioni (`/settings`):

| Parametro | Default | Range | Descrizione |
|---|---|---|---|
| `cron_page_size` | 20 | 1-50 | Lead da trovare per notte |
| `email_auto_outreach_enabled` | false | bool | Attiva la coda automatica (prepara email, NON invia) |
| `email_daily_limit` | 60 | 1-300 | Massimo email inviabili al giorno |
| `email_follow_up_enabled` | false | bool | Attiva 3 follow-up automatici |
| `email_follow_up_delays` | [3,6,9] | 1-30 | Giorni di attesa tra follow-up |

## Anti-ban Brevo

Misure per evitare il ban dell'account Brevo:

1. **Delay tra invii**: 1.5 secondi tra ogni email
2. **Limite giornaliero atomico**: `claim_queued_initial_emails()` blocca la riga settings con `FOR UPDATE` — due admin che cliccano contemporaneamente non possono sforare il limite
3. **Stop su rate limit**: se Brevo risponde 429, l'invio si ferma immediatamente e le email rimanenti restano in coda
4. **Retry intelligente**: email fallite per errori retryable (network, 5xx) vengono riprogrammate a 24 ore dopo con `attempt_count` incrementato (max 5)
5. **Opt-out in ogni messaggio**: riduce spam report e protegge la reputazione del mittente
6. **Mittente verificato**: l'email mittente deve essere verificata in Brevo prima dell'invio
7. **Nessun invio automatico notturno**: l'admin controlla la qualità dei lead prima di premere "Invia"
8. **Solo lead contattabili**: la coda esclude lead con chatbot concorrenti, senza contatti reali o con score insufficiente

## Dati estratti dal web scouting

| Campo | Metodo | Affidabilità |
|---|---|---|
| Email | Regex su HTML + link, filtra pattern invalidi (.png, @2x) | Alta (70%+ siti hanno email in chiaro) |
| Telefono mobile | Regex, prefisso IT (3xx) | Media (presente su ~40% siti) |
| Telefono fisso | Regex, prefisso IT (0xx) | Media |
| Booking | Pattern matching su provider noti + path + form fields | Alta per hospitality |
| WhatsApp | Cerca link wa.me, api.whatsapp.com | Alta |
| Chatbot concorrenti | Rileva Intercom, Drift, Tawk, Crisp, Zendesk, HubSpot | Alta |
| Social | Cerca link a Facebook, Instagram, LinkedIn, TikTok, YouTube, Tripadvisor | Alta |
| Sedi multiple | Pattern "Via/Piazza X 123, CAP Città" | Media (dipende dal formato del sito) |

## Limitazioni note

1. **Email non sempre disponibili.** Molti siti usano form di contatto senza esporre l'email in chiaro. In questi casi il lead viene creato ma nessuna email viene preparata.
2. **Fatturato e dipendenti.** Non estraibili in modo affidabile da un sito web. Richiederebbero API esterne (Camera di Commercio, LinkedIn) o stime euristiche.
3. **Pubblicità (ads).** Non rilevabile dal sito. Servirebbe Meta Ad Library API o Google Ads Transparency.
4. **Google Places quota.** Ogni batch search consuma fino a 3 chiamate API. Con 50 lead/notte e piano Google Cloud base, la quota mensile è sufficiente.
5. **Tempo di esecuzione.** ~45 secondi per 30 siti (fetch paralleli). Il cron ha timeout generoso.

## Evoluzioni future

- **Arricchimento LinkedIn/Tripadvisor**: estrarre recensioni, numero dipendenti, data fondazione
- **AI enrichment mirato**: OpenAI solo sui lead TOP (score > 75) per sales angle personalizzato
- **A/B testing template**: testare diverse versioni del template email e misurare tassi di apertura
- **Dashboard analytics**: metriche su lead generati, email inviate, aperture, risposte per categoria/zona
