export const EMAIL_OPTOUT_FOOTER = "Se non desidera ricevere altri messaggi, risponda a questa email e non la contatteremo più.";

export function withOptOut(body: string) {
  const trimmed = body.trim();
  return trimmed.includes(EMAIL_OPTOUT_FOOTER) ? trimmed : `${trimmed}\n\n${EMAIL_OPTOUT_FOOTER}`;
}

export function followUpBodies(businessName: string) {
  return [
    `Buongiorno, riprendo il messaggio precedente perché gli spunti individuati per ${businessName} potrebbero essere utili. Se ha senso, posso riassumerli in una breve chiamata.`,
    `Buongiorno, torno sul tema un'ultima volta con una proposta semplice: posso inviarle due osservazioni concrete sulla presenza digitale di ${businessName}, senza impegno.`,
    `Chiudo qui il filo per non essere insistente. Se in futuro vorrà confrontarsi su come migliorare acquisizione e presenza digitale di ${businessName}, resto volentieri disponibile.`,
  ].map(withOptOut);
}
