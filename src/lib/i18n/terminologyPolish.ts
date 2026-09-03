import { HOME_COPY } from './homeCopy';
import { snapshotLocalePack } from './localePacks/localePack';

function replaceTree(
  value: unknown,
  replacements: readonly (readonly [string, string])[],
): void {
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (typeof item === 'string') {
        value[index] = replacements.reduce(
          (text, [from, to]) => text.replaceAll(from, to),
          item,
        );
      } else {
        replaceTree(item, replacements);
      }
    }
    return;
  }

  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === 'string') {
      record[key] = replacements.reduce(
        (text, [from, to]) => text.replaceAll(from, to),
        item,
      );
    } else {
      replaceTree(item, replacements);
    }
  }
}

// The generic wallet pass deliberately prefers clear native nouns. Remove the
// extra adjective where English source capitalization would otherwise produce
// awkward Dutch/German grammar such as “Deze Digitale …”.
replaceTree(snapshotLocalePack('nl'), [
  ['Digitale portemonnees', 'Portemonnees'],
  ['digitale portemonnees', 'portemonnees'],
  ['Digitale portemonnee', 'Portemonnee'],
  ['digitale portemonnee', 'portemonnee'],
]);

replaceTree(snapshotLocalePack('de'), [
  ['Digitale Geldbörsen', 'Geldbörsen'],
  ['digitale Geldbörsen', 'Geldbörsen'],
  ['Digitale Geldbörse', 'Geldbörse'],
  ['digitale Geldbörse', 'Geldbörse'],
  // “Explorer” is established German crypto vocabulary. It remains here as a
  // normal borrowed word, not because it is treated as a protected brand name.
  ['VeChain-Blockübersicht', 'VeChain-Explorer'],
]);

// “round” was still leaking from an older hardening table in a few Latin
// locales. These are ordinary UI nouns, not product names.
replaceTree(snapshotLocalePack('it'), [
  ['Rounds', 'Tornate'],
  ['rounds', 'tornate'],
  ['Round', 'Tornata'],
  ['round', 'tornata'],
]);

replaceTree(snapshotLocalePack('fr'), [
  ['Rounds', 'Cycles'],
  ['rounds', 'cycles'],
  ['Round', 'Cycle'],
  ['round', 'cycle'],
]);

// Remove avoidable English marketing/product jargon from the four legacy Latin
// home translations where native wording is clearer for general users.
Object.assign(HOME_COPY.it, {
  emptyDescription:
    'Crea un invito e aiuta un nuovo utente, o uno che torna, a completare il percorso iniziale di VeInvite.',
  rewardLabel: 'STATO INIZIALE',
  rewardLocked: 'Completa la missione per terminare il percorso iniziale',
  rewardUnlocked: 'Percorso iniziale completato',
  completeDescription:
    'Il tuo amico ha completato la missione e il percorso iniziale è stato verificato.',
  cancelDescriptionWaiting:
    'Il link smetterà di funzionare e il tuo posto per un invito tornerà disponibile.',
  rewardTitle: 'Stato dell’invito',
  rewardClaimDescription:
    'L’invito ha superato i controlli finali. Richiedi ora la ricompensa e verrà inserita nella prossima tornata finanziata.',
  rewardForfeitedDescription:
    'Questo invito non ha superato i controlli finali. Puoi invitare un altro amico.',
  dappDescription:
    'VeInvite aiuta i nuovi utenti a iniziare e offre a chi torna un percorso chiaro per rientrare. Le campagne di invito dedicate a singole app arriveranno in un futuro aggiornamento.',
});

Object.assign(HOME_COPY.nl, {
  emptyDescription:
    'Maak één uitnodiging en help een nieuwe of terugkerende gebruiker het startproces van VeInvite af te ronden.',
  rewardLabel: 'STARTSTATUS',
  rewardLocked: 'Rond de missie af om het startproces te voltooien',
  rewardUnlocked: 'Startproces voltooid',
  completeDescription:
    'Je vriend heeft de missie afgerond en het startproces is geverifieerd.',
  dappDescription:
    'VeInvite helpt nieuwe gebruikers op weg en geeft terugkerende gebruikers een duidelijke route terug. Uitnodigingscampagnes voor afzonderlijke apps volgen in een toekomstige update.',
});

Object.assign(HOME_COPY.de, {
  emptyDescription:
    'Erstelle eine Einladung und hilf einem neuen oder zurückkehrenden Nutzer beim Einstieg in VeInvite.',
  rewardLabel: 'EINSTIEGSSTATUS',
  rewardLocked: 'Mission abschließen, um den Einstieg zu beenden',
  rewardUnlocked: 'Einstieg abgeschlossen',
  completeDescription:
    'Dein Freund hat die Mission abgeschlossen und der Einstieg wurde bestätigt.',
});

Object.assign(HOME_COPY.fr, {
  emptyDescription:
    'Créez une invitation et aidez un nouvel utilisateur, ou un utilisateur de retour, à prendre VeInvite en main.',
  rewardLabel: 'ÉTAT DE PRISE EN MAIN',
  rewardLocked: 'Terminez la mission pour finaliser la prise en main',
  rewardUnlocked: 'Prise en main terminée',
  completeDescription:
    'Votre ami a terminé la mission et la prise en main a été vérifiée.',
});
