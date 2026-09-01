import type { Locale } from './locales';

type GuideCopy = {
  eyebrow: string;
  title: string;
  inviteStepTitle: string;
  eligibilityTitle: string;
  newTitle: string;
  returningTitle: string;
  countTitle: string;
};

// Keep this file limited to labels that are unique to the Guide screen.
// Flow, mission, eligibility, and reward descriptions live in their dedicated
// locale modules so retired verification/claim wording cannot linger here and
// accidentally return later.
export const GUIDE_COPY: Record<Locale, GuideCopy> = {
  en: {
    eyebrow: '30-SECOND GUIDE',
    title: 'How VeInvite works',
    inviteStepTitle: 'Invite one friend',
    eligibilityTitle: 'Who can take part?',
    newTitle: 'New user',
    returningTitle: 'Returning user',
    countTitle: 'What the public totals count',
  },
  ko: {
    eyebrow: '30초 가이드',
    title: '이렇게 초대하면 돼요',
    inviteStepTitle: '친구 한 명 초대',
    eligibilityTitle: '누가 참여할 수 있나요?',
    newTitle: '신규 사용자',
    returningTitle: '복귀 사용자',
    countTitle: '공개 집계 기준',
  },
  zh: {
    eyebrow: '30 秒指南',
    title: 'VeInvite 怎么用',
    inviteStepTitle: '邀请一位好友',
    eligibilityTitle: '哪些用户可以参加？',
    newTitle: '新用户',
    returningTitle: '回归用户',
    countTitle: '公开数据如何统计',
  },
  hi: {
    eyebrow: '30-सेकंड गाइड',
    title: 'VeInvite कैसे काम करता है',
    inviteStepTitle: 'एक दोस्त को आमंत्रित करें',
    eligibilityTitle: 'कौन भाग ले सकता है?',
    newTitle: 'नया उपयोगकर्ता',
    returningTitle: 'वापसी करने वाला उपयोगकर्ता',
    countTitle: 'सार्वजनिक आँकड़ों में क्या गिना जाता है',
  },
  es: {
    eyebrow: 'GUÍA EN 30 SEGUNDOS',
    title: 'Cómo funciona VeInvite',
    inviteStepTitle: 'Invita a un amigo',
    eligibilityTitle: '¿Quién puede participar?',
    newTitle: 'Usuario nuevo',
    returningTitle: 'Usuario que regresa',
    countTitle: 'Qué incluyen las cifras públicas',
  },
  ja: {
    eyebrow: '30秒ガイド',
    title: 'VeInviteの使い方',
    inviteStepTitle: '友だちを1人招待',
    eligibilityTitle: '参加できるのは？',
    newTitle: '新規ユーザー',
    returningTitle: '復帰ユーザー',
    countTitle: '公開集計の対象',
  },
  it: {
    eyebrow: 'GUIDA IN 30 SECONDI',
    title: 'Come funziona VeInvite',
    inviteStepTitle: 'Invita un amico',
    eligibilityTitle: 'Chi può partecipare?',
    newTitle: 'Nuovo utente',
    returningTitle: 'Utente di ritorno',
    countTitle: 'Cosa includono i dati pubblici',
  },
  tr: {
    eyebrow: '30 SANİYELİK REHBER',
    title: 'VeInvite nasıl çalışır',
    inviteStepTitle: 'Bir arkadaşını davet et',
    eligibilityTitle: 'Kimler katılabilir?',
    newTitle: 'Yeni kullanıcı',
    returningTitle: 'Geri dönen kullanıcı',
    countTitle: 'Herkese açık toplamlar neyi sayıyor?',
  },
  nl: {
    eyebrow: 'UITLEG IN 30 SECONDEN',
    title: 'Zo werkt VeInvite',
    inviteStepTitle: 'Nodig één vriend uit',
    eligibilityTitle: 'Wie kan meedoen?',
    newTitle: 'Nieuwe gebruiker',
    returningTitle: 'Terugkerende gebruiker',
    countTitle: 'Wat telt mee in de openbare cijfers?',
  },
  de: {
    eyebrow: '30-SEKUNDEN-ANLEITUNG',
    title: 'So funktioniert VeInvite',
    inviteStepTitle: 'Einen Freund einladen',
    eligibilityTitle: 'Wer kann teilnehmen?',
    newTitle: 'Neuer Nutzer',
    returningTitle: 'Zurückkehrender Nutzer',
    countTitle: 'Was zählt in den öffentlichen Zahlen?',
  },
  fr: {
    eyebrow: 'GUIDE EN 30 SECONDES',
    title: 'Comment fonctionne VeInvite',
    inviteStepTitle: 'Invitez un ami',
    eligibilityTitle: 'Qui peut participer ?',
    newTitle: 'Nouvel utilisateur',
    returningTitle: 'Utilisateur de retour',
    countTitle: 'Ce que comptent les chiffres publics',
  },
};