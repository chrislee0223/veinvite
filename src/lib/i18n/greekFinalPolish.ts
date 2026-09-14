import { HOME_COPY } from './homeCopy';
import { INVITE_LANDING_COPY } from './inviteLandingCopy';
import { INVITEE_COPY } from './inviteeCopy';
import { LEADERBOARD_COPY } from './leaderboardCopy';
import { NOTIFICATION_COPY } from './notificationCopy';
import { SETTINGS_COPY } from './settingsCopy';

// Greek was added after the original core locale tables and initially reused
// the English locale as a typed base. Keep the already reviewed Greek copy,
// but replace every remaining product-facing English fallback explicitly.
Object.assign(HOME_COPY.el, {
  reviewBadge: 'ΤΕΛΙΚΟΣ ΕΛΕΓΧΟΣ',
  reviewTitle: 'Γίνεται ο τελικός έλεγχος',
  reviewDescription: 'Περίμενε λίγο. Αυτό το βήμα πρέπει να επαληθευτεί πριν ολοκληρωθεί.',
  cancelTitleWaiting: 'Να ακυρωθεί αυτός ο σύνδεσμος πρόσκλησης;',
  cancelDescriptionWaiting: 'Ο σύνδεσμος θα σταματήσει να λειτουργεί και η θέση πρόσκλησης θα γίνει ξανά διαθέσιμη.',
  cancelled: 'Η πρόσκληση ακυρώθηκε. Μπορείς να δημιουργήσεις νέα πρόσκληση.',
  createLink: 'Πρόσκληση',
  linkCreated: 'Ο σύνδεσμος είναι έτοιμος',
  waitingForFriendStep: 'Αναμονή φίλου',
  friendJoins: 'Ο φίλος συμμετείχε',
  activation: 'Τελική επαλήθευση',
  codeLabel: 'Κωδικός πρόσκλησης',
  rewardPending: 'Οι αποστολές ολοκληρώθηκαν',
  rewardDescription: 'Ο φίλος σου ολοκλήρωσε όλες τις αποστολές. Μπορείς να ελέγξεις εδώ την κατάσταση της ανταμοιβής σου στο VeInvite.',
  rewardClaimReady: 'Η ανταμοιβή σου είναι έτοιμη',
  rewardClaimDescription: 'Η παραπομπή πέρασε τους τελικούς ελέγχους και θα επεξεργαστεί στον επόμενο χρηματοδοτούμενο γύρο ανταμοιβών.',
  claimReward: 'Έλεγχος ανταμοιβής',
  claimingReward: 'Έλεγχος…',
  rewardClaimed: 'Η ανταμοιβή μπήκε σε αυτόματη επεξεργασία',
  rewardClaimedDescription: 'Η επαληθευμένη παραπομπή προστέθηκε αυτόματα στον επόμενο χρηματοδοτούμενο γύρο ανταμοιβών. Δεν χρειάζεται άλλη ενέργεια.',
  rewardAssigned: 'Προετοιμάζεται η πληρωμή της ανταμοιβής',
  rewardAssignedDescription: 'Το ποσό σου έχει δεσμευτεί σε έναν γύρο πληρωμών και περιμένει την τελική διανομή.',
  rewardPaidDescription: 'Η ανταμοιβή B3TR επαληθεύτηκε on-chain και καταγράφηκε στο ιστορικό ανταμοιβών σου.',
  rewardForfeited: 'Η ανταμοιβή δεν εγκρίθηκε',
  rewardForfeitedDescription: 'Αυτή η παραπομπή δεν πέρασε τον τελικό έλεγχο ανταμοιβής. Η θέση πρόσκλησής σου είναι ξανά διαθέσιμη για άλλο άτομο.',
  claimSuccess: 'Η κατάσταση της ανταμοιβής ενημερώθηκε για τον επόμενο χρηματοδοτούμενο γύρο.',
  claimError: 'Δεν ήταν δυνατή η ενημέρωση του αιτήματος ανταμοιβής.',
  loadError: 'Δεν ήταν δυνατή η φόρτωση των στοιχείων της πρόσκλησης.',
  createError: 'Δεν ήταν δυνατή η δημιουργία της πρόσκλησης.',
  cancelError: 'Δεν ήταν δυνατή η ακύρωση της πρόσκλησης.',
  dappTitle: 'Σχεδιασμένο για το οικοσύστημα VeBetterDAO',
  dappDescription: 'Το VeInvite βοηθά νέους χρήστες να ξεκινήσουν και δίνει στους επιστρέφοντες χρήστες έναν σαφή δρόμο επιστροφής. Η υποστήριξη καμπανιών παραπομπής ανά dApp σχεδιάζεται για μελλοντική ενημέρωση.',
});

Object.assign(INVITE_LANDING_COPY.el, {
  demoResult: 'Αποτέλεσμα επίδειξης',
  demoSuccess: 'Επιλέξιμος',
  demoExisting: 'Υφιστάμενος χρήστης',
  demoOther: 'Συνδεδεμένο με άλλη πρόσκληση',
  demoReview: 'Έλεγχος ασφαλείας',
});

Object.assign(INVITEE_COPY.el, {
  checkingLink: 'Έλεγχος συνδέσμου πρόσκλησης',
  checkingHistory: 'Έλεγχος ιστορικού δραστηριότητας VeBetterDAO',
  checkingOtherInvite: 'Έλεγχος σύνδεσης με άλλη πρόσκληση',
  reviewTitle: 'Χρειάζεται ένας ακόμη έλεγχος',
  reviewDescription: 'Μπορείς να συνεχίσεις από αυτή την οθόνη μόλις ολοκληρωθεί ο έλεγχος.',
  newSuccessDescription: 'Δεν βρέθηκε προηγούμενο ιστορικό ανταμοιβών VeBetterDAO ή Allocation Voting για αυτό το πορτοφόλι. Μπορείς να συνεχίσεις με τις αποστολές VeInvite.',
  returningSuccessDescription: 'Αυτό το πορτοφόλι έχει παλαιότερη δραστηριότητα VeBetterDAO, αλλά καμία ανταμοιβή VeBetterDAO ή δραστηριότητα Allocation Voting από την έναρξη του παλαιότερου από τους τελευταίους 12 ολοκληρωμένους γύρους. Μπορείς να συνεχίσεις με τις αποστολές VeInvite.',
  oneThingToDo: 'Οι αποστολές μου',
  walletMissionDescription: 'Είσαι έτοιμος να ξεκινήσεις.',
  appMissionDescription: 'Λάβε B3TR από 3 διαφορετικά dApps. Μετά την πρώτη επιλέξιμη ανταμοιβή μπορείς να συνεχίσεις και με τις επόμενες αποστολές.',
  conversionMissionDescription: 'Μετά την πρώτη επιλέξιμη ανταμοιβή dApp, κάνε μια νέα μετατροπή τουλάχιστον 1 B3TR σε VOT3.',
  voteMissionDescription: 'Μετά την επιλέξιμη μετατροπή B3TR σε VOT3, συμμετείχε μία φορά στο Allocation Voting.',
  demoComplete: 'Επίδειξη: εμφάνιση ολοκληρωμένης αποστολής',
  autoProgress: 'Οι ανταμοιβές dApp, η μετατροπή VOT3 και η συμμετοχή σου στο Allocation Voting επαληθεύονται αυτόματα on-chain.',
  requestNewLink: 'Ζήτησε από τον φίλο σου έναν νέο σύνδεσμο πρόσκλησης.',
  existingHelp: 'Εντοπίστηκε πρόσφατη δραστηριότητα VeBetterDAO, επομένως αυτό το πορτοφόλι δεν είναι προς το παρόν επιλέξιμο για το VeInvite. Μπορείς να συνεχίσεις να χρησιμοποιείς κανονικά το VeBetterDAO.',
  selfReferralHelp: 'Δεν επιτρέπονται οι αυτοπαραπομπές. Μοιράσου την πρόσκλησή σου με κάποιο άλλο άτομο.',
  otherHelp: 'Συνέχισε τις αποστολές από την πρόσκληση που είναι ήδη συνδεδεμένη με αυτό το πορτοφόλι.',
});

Object.assign(LEADERBOARD_COPY.el, {
  reportingSince: (round: number) => `Τα επίσημα σύνολα καταγράφονται από τον Γύρο ${round}.`,
  rank: 'Θέση',
  wallet: 'Προσκαλών',
  completed: 'Προσκλήσεις',
  earned: 'Ανταμοιβές',
  myRank: 'Η θέση μου',
  unranked: 'Χωρίς κατάταξη',
  connectForRank: 'Σύνδεσε το πορτοφόλι σου για να δεις εδώ τη θέση σου.',
  empty: 'Δεν υπάρχουν ακόμη προσκλήσεις στην κατάταξη.',
  loading: 'Φόρτωση κατάταξης…',
  loadError: 'Δεν ήταν δυνατή η φόρτωση της κατάταξης.',
  retry: 'Δοκίμασε ξανά',
  walletDetails: 'Στοιχεία προσκαλούντος',
  fullAddress: 'Πλήρης διεύθυνση πορτοφολιού',
  viewExplorer: 'Προβολή στο VeChain Explorer',
  explorerNote: 'Το Explorer εμφανίζει δημόσια on-chain δραστηριότητα.',
  close: 'Κλείσιμο',
  openWallet: (address: string) => `Προβολή στοιχείων για τον προσκαλούντα ${address}`,
});

Object.assign(NOTIFICATION_COPY.el, {
  progressTitle: 'Η μετατροπή VOT3 ολοκληρώθηκε!',
  progressVot3Body: 'Ο φίλος σου ολοκλήρωσε την αποστολή dApp και μετέτρεψε B3TR σε VOT3.',
});

Object.assign(SETTINGS_COPY.el, {
  walletNote: 'Η αποσύνδεση δεν διαγράφει το ιστορικό προσκλήσεων ή ανταμοιβών σου.',
  switchNote: 'Όταν συνδέσεις άλλο πορτοφόλι, θα υπογράψεις μία φορά για να επιβεβαιώσεις ότι σου ανήκει.',
  actionError: 'Δεν ήταν δυνατή η αλλαγή της σύνδεσης πορτοφολιού. Δοκίμασε ξανά.',
  switchConfirmTitle: 'Να συνδεθεί άλλο πορτοφόλι;',
  switchConfirmBody: 'Θα αποσυνδεθείς από το τρέχον πορτοφόλι και θα επιλέξεις άλλο. Το ιστορικό προσκλήσεων και ανταμοιβών θα παραμείνει ανέπαφο.',
  switchConfirmAction: 'Σύνδεση άλλου πορτοφολιού',
  disconnectConfirmTitle: 'Να αποσυνδεθεί αυτό το πορτοφόλι;',
  disconnectConfirmBody: 'Το VeInvite θα σταματήσει να χρησιμοποιεί το τρέχον συνδεδεμένο πορτοφόλι. Το ιστορικό προσκλήσεων και ανταμοιβών θα παραμείνει ανέπαφο.',
  disconnectConfirmAction: 'Αποσύνδεση πορτοφολιού',
});
