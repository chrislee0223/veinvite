import { NOTIFICATION_COPY } from './notificationCopy';
import { REWARD_RECEIPT_COPY } from './rewardReceiptCopy';
import { SETTINGS_COPY } from './settingsCopy';

// Final product-copy review for transient/high-attention surfaces.
// Product and protocol terms (VeInvite, VeBetterDAO, B3TR, VOT3,
// Allocation Voting, dApp, VeChain Explorer) intentionally remain unchanged.
// These overrides remove avoidable English UI scaffolding from a few expanded
// locales while keeping familiar crypto terms where a forced translation would
// be less natural for users.

Object.assign(NOTIFICATION_COPY.mr, {
  bellAria: 'सूचना उघडा',
  closeAria: 'सूचना बंद करा',
  vot3Title: 'VOT3 रूपांतरण पूर्ण!',
  vot3Body: 'तुमच्या मित्राने B3TR चे VOT3 मध्ये रूपांतरण केले आहे.',
  progressTitle: 'VOT3 रूपांतरण पूर्ण!',
  progressVot3Body:
    'तुमच्या मित्राने dApp मिशन पूर्ण करून B3TR चे VOT3 मध्ये रूपांतरण केले आहे.',
  allMissionsHint:
    'आता तुम्ही VeInvite मध्ये बक्षिसाची स्थिती पाहू शकता.',
  rewardTitle: 'बक्षीस दिले गेले!',
  rewardBody: 'B3TR बक्षीस तुमच्या वॉलेटमध्ये पाठवले आहे.',
  acknowledgementError:
    'ही सूचना वाचलेली म्हणून नोंदवता आली नाही. पुन्हा प्रयत्न करा.',
});

Object.assign(REWARD_RECEIPT_COPY.mr, {
  eyebrow: 'रेफरल बक्षीस दिले गेले',
  title: 'तुमचे B3TR बक्षीस आले आहे',
  description: 'VeInvite रेफरल बक्षीस या वॉलेटमध्ये जमा झाले आहे.',
  transaction: 'व्यवहार',
  acknowledging: 'जतन करत आहे…',
  error:
    'ही बक्षिसाची पावती पाहिलेली म्हणून नोंदवता आली नाही. पुन्हा प्रयत्न करा.',
});

Object.assign(SETTINGS_COPY.mr, {
  title: 'अॅप सेटिंग्ज',
  connected: 'जोडलेले',
  notConnected: 'वॉलेट जोडलेले नाही',
  working: 'प्रक्रिया सुरू आहे…',
  actionError: 'वॉलेट कनेक्शन बदलता आले नाही. पुन्हा प्रयत्न करा.',
  languageNote: 'तुमची भाषा पुढच्या भेटीसाठी जतन केली जाते.',
});

Object.assign(NOTIFICATION_COPY.te, {
  closeAria: 'నోటిఫికేషన్ మూసివేయండి',
  vot3Title: 'VOT3 మార్పిడి పూర్తయింది!',
  progressTitle: 'VOT3 మార్పిడి పూర్తయింది!',
  allMissionsHint:
    'ఇప్పుడు VeInvite లో రివార్డ్ స్థితిని చూడవచ్చు.',
  acknowledgementError:
    'ఈ నోటిఫికేషన్‌ను చదివినట్లు గుర్తించలేకపోయాం. మళ్లీ ప్రయత్నించండి.',
});

Object.assign(REWARD_RECEIPT_COPY.te, {
  transaction: 'లావాదేవీ',
  acknowledging: 'భద్రపరుస్తోంది…',
  error:
    'ఈ రివార్డ్ రసీదును చూసినట్లు గుర్తించలేకపోయాం. మళ్లీ ప్రయత్నించండి.',
});

Object.assign(SETTINGS_COPY.te, {
  connected: 'కనెక్ట్ అయింది',
  working: 'ప్రక్రియలో ఉంది…',
  languageNote:
    'మీ భాష ఎంపిక తదుపరి సందర్శన కోసం భద్రపరచబడుతుంది.',
});

Object.assign(NOTIFICATION_COPY.ha, {
  bellAria: 'Buɗe sanarwa',
  closeAria: 'Rufe sanarwar',
  vot3Title: 'An kammala sauyawa zuwa VOT3!',
  progressTitle: 'An kammala sauyawa zuwa VOT3!',
  allMissionsHint:
    'Yanzu za ka iya duba matsayin ladan ka a VeInvite.',
  rewardTitle: 'An biya lada!',
  rewardBody: 'An aika ladan B3TR zuwa wallet ɗinka.',
  acknowledgementError:
    'Ba a iya nuna wannan sanarwar a matsayin an karanta ba. Sake gwadawa.',
});

Object.assign(REWARD_RECEIPT_COPY.ha, {
  eyebrow: 'AN BIYA LADAN REFERRAL',
  title: 'Ladan B3TR ɗinka ya iso',
  description: 'An biya ladan referral na VeInvite zuwa wannan wallet.',
  acknowledging: 'Ana ajiyewa…',
  error:
    'Ba a iya nuna wannan takardar lada a matsayin an gani ba. Sake gwadawa.',
});

Object.assign(SETTINGS_COPY.ha, {
  working: 'Ana aiki…',
  actionError: 'Ba a iya canza haɗin wallet ba. Sake gwadawa.',
  languageNote: 'Za a ajiye harshen da ka zaɓa don ziyara ta gaba.',
});

Object.assign(NOTIFICATION_COPY.sw, {
  vot3Title: 'Ubadilishaji kwenda VOT3 umekamilika!',
  progressTitle: 'Ubadilishaji kwenda VOT3 umekamilika!',
});

Object.assign(REWARD_RECEIPT_COPY.sw, {
  transaction: 'Muamala',
});

// These controls close one dialog, not the entire notifications collection.
NOTIFICATION_COPY.sv.closeAria = 'Stäng avisering';
NOTIFICATION_COPY.ro.closeAria = 'Închide notificarea';
