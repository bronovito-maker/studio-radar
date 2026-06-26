# Standard Tecnici

## TypeScript

- `strict` attivo.
- Evitare `any` salvo motivazione locale.
- Tipi dominio in `lib/*/types.ts` o generati da Supabase.
- Validazione runtime per input esterni.

## Validazione

Usare schemi runtime per:

- body API;
- query params;
- CSV import;
- output AI;
- impostazioni modificabili da UI.

## Error handling

- Errori utente: messaggi chiari e azionabili.
- Errori server: log dettagliato, risposta sanitizzata.
- Integrazioni esterne: timeout e fallback.

## Database

- Ogni tabella pubblica ha RLS.
- Ogni query frequente ha indice valutato.
- Le migrazioni sono la fonte della verita.
- Niente modifiche manuali non riproducibili in dashboard.

## UI

- Componenti piccoli, accessibili e riusabili.
- Niente business logic nascosta nei componenti visuali.
- Tabelle e form devono gestire loading, empty, error e disabled state.

## Testing

- Unit test per scoring, validazioni, deduplica, template messaggi.
- Integration test per API critiche quando possibile.
- Playwright per login, lead list, import, ricerca e cambio stato.

## Dipendenze

Prima di aggiungere una dipendenza chiedersi:

- evita davvero complessita?
- e mantenuta?
- serve nel client o solo server?
- aumenta bundle o superficie di rischio?

## Naming

- Database: snake_case.
- TypeScript: camelCase.
- Componenti React: PascalCase.
- Stati lead: enum inglesi stabili, label UI italiane.

