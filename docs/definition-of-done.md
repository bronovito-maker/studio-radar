# Definition of Done

Una feature e finita solo se:

- il comportamento richiesto funziona end-to-end;
- input e output sono validati;
- errori prevedibili sono gestiti;
- permessi e ruoli sono rispettati;
- nessun segreto viene esposto al client;
- ci sono test proporzionati al rischio;
- la UI gestisce loading, empty ed error state;
- la documentazione viene aggiornata se cambia una decisione;
- `npm run build` passa;
- `npm run lint` passa;
- non vengono introdotte dipendenze non motivate.

## Per feature con database

- Migrazione idempotente/applicabile da zero.
- RLS e policy definite.
- Indici per query principali.
- Audit event se l'azione modifica stato commerciale.

## Per feature con integrazioni esterne

- Chiavi solo server side.
- Timeout.
- Retry controllato quando appropriato.
- Log errore sanitizzato.
- Fallback utente comprensibile.
- Test o mock per sviluppo locale.

## Per feature AI

- Prompt versionato.
- Output strutturato e validato.
- Fallback non distruttivo.
- Salvataggio input snapshot.
- Nessuna automazione irreversibile basata solo su AI.

