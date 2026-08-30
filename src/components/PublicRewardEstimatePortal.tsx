'use client';

import {
  useEffect,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import {
  isLocale,
  localeFromLanguageTag,
  type Locale,
} from '@/lib/i18n/locales';

type RewardEstimateResponse =
  | {
      generatedAt: string;
      status: 'pending';
      reason: 'awaiting_first_allocation' | 'insufficient_reward_data';
      basisRoundId: null;
      estimatedRewardWei: null;
      expectedRecipients: null;
      stressRecipients: null;
    }
  | {
      generatedAt: string;
      status: 'ready';
      reason: null;
      basisRoundId: number;
      estimatedRewardWei: string;
      expectedRecipients: number;
      stressRecipients: number;
    };

type RewardEstimateCopy = {
  eyebrow: string;
  title: string;
  perInvite: string;
  expectedParticipants: string;
  basisRound: (round: number) => string;
  disclaimer: string;
  pendingTitle: string;
  pendingDescription: string;
  unavailable: string;
};

const COPY: Record<Locale, RewardEstimateCopy> = {
  en: {
    eyebrow: 'ESTIMATED REWARD',
    title: 'If you start inviting now',
    perInvite: 'Per successful invite',
    expectedParticipants: 'Estimated reward recipients',
    basisRound: (round) => `Based on Round ${round}`,
    disclaimer: 'This is an estimate based on the latest VeInvite allocation and current participant pipeline. The actual reward may change and is not guaranteed.',
    pendingTitle: 'Estimate coming soon',
    pendingDescription: 'An estimate will appear automatically after VeInvite receives its first real B3TR allocation.',
    unavailable: 'The reward estimate is temporarily unavailable.',
  },
  ko: {
    eyebrow: '예상 보상',
    title: '지금 초대를 시작한다면',
    perInvite: '성공한 초대 1건 기준',
    expectedParticipants: '예상 보상 대상',
    basisRound: (round) => `${round} 라운드 기준`,
    disclaimer: '최근 VeInvite 배정량과 현재 참여 현황을 바탕으로 계산한 예상치예요. 실제 보상은 달라질 수 있으며 확정 금액이 아닙니다.',
    pendingTitle: '예측 준비 중',
    pendingDescription: 'VeInvite가 첫 실제 B3TR 배정을 받은 뒤 예상 보상이 자동으로 표시돼요.',
    unavailable: '지금은 예상 보상을 계산할 수 없어요.',
  },
  zh: {
    eyebrow: '预计奖励',
    title: '如果现在开始邀请',
    perInvite: '每次成功邀请',
    expectedParticipants: '预计奖励人数',
    basisRound: (round) => `基于第 ${round} 轮`,
    disclaimer: '该数值根据 VeInvite 最近一次分配和当前参与情况估算。实际奖励可能变化，并非保证金额。',
    pendingTitle: '正在准备预测',
    pendingDescription: 'VeInvite 收到首次实际 B3TR 分配后，这里会自动显示预计奖励。',
    unavailable: '暂时无法计算预计奖励。',
  },
  hi: {
    eyebrow: 'अनुमानित इनाम',
    title: 'अगर आप अभी आमंत्रित करना शुरू करें',
    perInvite: 'हर सफल आमंत्रण पर',
    expectedParticipants: 'अनुमानित इनाम पाने वाले',
    basisRound: (round) => `राउंड ${round} के आधार पर`,
    disclaimer: 'यह VeInvite के नवीनतम आवंटन और मौजूदा भागीदारी के आधार पर अनुमान है। वास्तविक इनाम बदल सकता है और इसकी गारंटी नहीं है।',
    pendingTitle: 'अनुमान जल्द उपलब्ध होगा',
    pendingDescription: 'VeInvite को पहला वास्तविक B3TR आवंटन मिलने के बाद अनुमानित इनाम अपने-आप दिखाई देगा।',
    unavailable: 'फिलहाल इनाम का अनुमान उपलब्ध नहीं है।',
  },
  es: {
    eyebrow: 'RECOMPENSA ESTIMADA',
    title: 'Si empiezas a invitar ahora',
    perInvite: 'Por invitación completada',
    expectedParticipants: 'Destinatarios estimados',
    basisRound: (round) => `Basado en la ronda ${round}`,
    disclaimer: 'Es una estimación basada en la última asignación de VeInvite y la participación actual. La recompensa real puede variar y no está garantizada.',
    pendingTitle: 'Estimación en preparación',
    pendingDescription: 'La recompensa estimada aparecerá automáticamente cuando VeInvite reciba su primera asignación real de B3TR.',
    unavailable: 'La estimación de recompensa no está disponible temporalmente.',
  },
  ja: {
    eyebrow: '予想報酬',
    title: '今から招待を始めた場合',
    perInvite: '招待成功1件あたり',
    expectedParticipants: '予想報酬対象者数',
    basisRound: (round) => `ラウンド${round}を基準`,
    disclaimer: '直近のVeInvite配分量と現在の参加状況をもとにした予想値です。実際の報酬は変動する場合があり、保証額ではありません。',
    pendingTitle: '予測を準備中',
    pendingDescription: 'VeInviteが初回のB3TR配分を受け取ると、予想報酬が自動的に表示されます。',
    unavailable: '現在、予想報酬を計算できません。',
  },
  it: {
    eyebrow: 'RICOMPENSA STIMATA',
    title: 'Se inizi a invitare ora',
    perInvite: 'Per invito completato',
    expectedParticipants: 'Destinatari stimati',
    basisRound: (round) => `In base al round ${round}`,
    disclaimer: 'È una stima basata sull’ultima allocazione VeInvite e sulla partecipazione attuale. La ricompensa effettiva può variare e non è garantita.',
    pendingTitle: 'Stima in preparazione',
    pendingDescription: 'La ricompensa stimata apparirà automaticamente dopo la prima allocazione B3TR reale ricevuta da VeInvite.',
    unavailable: 'La stima della ricompensa non è al momento disponibile.',
  },
  tr: {
    eyebrow: 'TAHMİNİ ÖDÜL',
    title: 'Şimdi davet etmeye başlarsan',
    perInvite: 'Başarılı davet başına',
    expectedParticipants: 'Tahmini ödül alacak kişi sayısı',
    basisRound: (round) => `${round}. tur baz alınmıştır`,
    disclaimer: 'Bu değer, son VeInvite tahsisi ve mevcut katılım durumuna göre yapılan bir tahmindir. Gerçek ödül değişebilir ve garanti edilmez.',
    pendingTitle: 'Tahmin hazırlanıyor',
    pendingDescription: 'VeInvite ilk gerçek B3TR tahsisini aldıktan sonra tahmini ödül otomatik olarak gösterilecek.',
    unavailable: 'Ödül tahmini şu anda kullanılamıyor.',
  },
  nl: {
    eyebrow: 'GESCHATTE BELONING',
    title: 'Als je nu begint met uitnodigen',
    perInvite: 'Per succesvolle uitnodiging',
    expectedParticipants: 'Geschat aantal beloningsontvangers',
    basisRound: (round) => `Gebaseerd op ronde ${round}`,
    disclaimer: 'Dit is een schatting op basis van de laatste VeInvite-toewijzing en de huidige deelname. De werkelijke beloning kan veranderen en is niet gegarandeerd.',
    pendingTitle: 'Schatting wordt voorbereid',
    pendingDescription: 'De geschatte beloning verschijnt automatisch nadat VeInvite de eerste echte B3TR-toewijzing ontvangt.',
    unavailable: 'De beloningsschatting is tijdelijk niet beschikbaar.',
  },
  de: {
    eyebrow: 'GESCHÄTZTE BELOHNUNG',
    title: 'Wenn du jetzt mit dem Einladen beginnst',
    perInvite: 'Pro erfolgreicher Einladung',
    expectedParticipants: 'Geschätzte Zahl der Empfänger',
    basisRound: (round) => `Basierend auf Runde ${round}`,
    disclaimer: 'Dies ist eine Schätzung auf Basis der letzten VeInvite-Zuteilung und der aktuellen Teilnahme. Die tatsächliche Belohnung kann abweichen und ist nicht garantiert.',
    pendingTitle: 'Schätzung wird vorbereitet',
    pendingDescription: 'Die geschätzte Belohnung erscheint automatisch, sobald VeInvite die erste echte B3TR-Zuteilung erhält.',
    unavailable: 'Die Belohnungsschätzung ist vorübergehend nicht verfügbar.',
  },
  fr: {
    eyebrow: 'RÉCOMPENSE ESTIMÉE',
    title: 'Si vous commencez à inviter maintenant',
    perInvite: 'Par invitation réussie',
    expectedParticipants: 'Nombre estimé de bénéficiaires',
    basisRound: (round) => `D’après le round ${round}`,
    disclaimer: 'Il s’agit d’une estimation fondée sur la dernière allocation VeInvite et la participation actuelle. La récompense réelle peut varier et n’est pas garantie.',
    pendingTitle: 'Estimation en préparation',
    pendingDescription: 'La récompense estimée s’affichera automatiquement après la première allocation réelle de B3TR reçue par VeInvite.',
    unavailable: 'L’estimation de la récompense est temporairement indisponible.',
  },
};

function formatRewardWei(value: string): string {
  if (!/^\d+$/.test(value)) return '0';

  const normalized = value.replace(/^0+(?=\d)/, '');
  const padded = normalized.padStart(19, '0');
  const whole = padded.slice(0, -18);
  const fraction = padded.slice(-18, -14).replace(/0+$/, '');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return fraction ? `${groupedWhole}.${fraction}` : groupedWhole;
}

function recipientRange(expected: number, stress: number): string {
  const low = Math.min(expected, stress);
  const high = Math.max(expected, stress);

  return low === high ? low.toLocaleString() : `${low.toLocaleString()}–${high.toLocaleString()}`;
}

export function PublicRewardEstimatePortal() {
  const [mount, setMount] = useState<HTMLDivElement | null>(null);
  const [locale, setLocale] = useState<Locale>('en');
  const [estimate, setEstimate] = useState<RewardEstimateResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let activeMount: HTMLDivElement | null = null;

    const detach = () => {
      activeMount?.remove();
      activeMount = null;
      setMount(null);
    };

    const attach = () => {
      const impactCard = document.querySelector<HTMLElement>(
        '.leaderboardPage .impactCard',
      );

      if (!impactCard) {
        if (activeMount && !activeMount.isConnected) {
          activeMount = null;
          setMount(null);
        }
        return;
      }

      if (
        activeMount?.isConnected &&
        activeMount.previousElementSibling === impactCard
      ) {
        return;
      }

      detach();
      const nextMount = document.createElement('div');
      nextMount.className = 'leaderboardRewardEstimateMount';
      impactCard.insertAdjacentElement('afterend', nextMount);
      activeMount = nextMount;
      setMount(nextMount);
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      detach();
    };
  }, []);

  useEffect(() => {
    const syncFromDocument = () => {
      const next = localeFromLanguageTag(document.documentElement.lang);
      if (next) setLocale(next);
    };
    const syncFromEvent = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isLocale(detail)) setLocale(detail);
    };

    syncFromDocument();
    window.addEventListener('veinvite-language-change', syncFromEvent);
    return () => window.removeEventListener('veinvite-language-change', syncFromEvent);
  }, []);

  useEffect(() => {
    if (!mount) return;

    let active = true;
    let controller: AbortController | null = null;

    const loadEstimate = () => {
      controller?.abort();
      controller = new AbortController();
      setUnavailable(false);

      void fetch('/api/rewards/estimate', {
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('Reward estimate request failed.');
          return (await response.json()) as RewardEstimateResponse;
        })
        .then((result) => {
          if (active) setEstimate(result);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          if (active) setUnavailable(true);
        });
    };

    setEstimate(null);
    loadEstimate();

    const intervalId = window.setInterval(loadEstimate, 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        loadEstimate();
      }
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      controller?.abort();
    };
  }, [mount]);

  if (!mount) return null;

  const t = COPY[locale];

  return createPortal(
    <section className="publicRewardEstimateCard" aria-live="polite">
      <div className="estimateTop">
        <div>
          <span className="estimateEyebrow">{t.eyebrow}</span>
          <h2>{estimate?.status === 'ready' ? t.title : t.pendingTitle}</h2>
        </div>
        <span className="estimateBadge">B3TR</span>
      </div>

      {unavailable ? (
        <p className="estimatePending">{t.unavailable}</p>
      ) : estimate?.status === 'ready' ? (
        <>
          <div className="estimateAmount">
            <strong>≈ {formatRewardWei(estimate.estimatedRewardWei)} B3TR</strong>
            <span>{t.perInvite}</span>
          </div>
          <div className="estimateMeta">
            <span><small>{t.expectedParticipants}</small><strong>{recipientRange(estimate.expectedRecipients, estimate.stressRecipients)}</strong></span>
            <span><small>{t.basisRound(estimate.basisRoundId)}</small><strong>#{estimate.basisRoundId}</strong></span>
          </div>
          <p className="estimateDisclaimer">{t.disclaimer}</p>
        </>
      ) : (
        <p className="estimatePending">{t.pendingDescription}</p>
      )}

      <style jsx>{`
        .publicRewardEstimateCard { margin-top:18px; padding:18px; border:1px solid rgba(255,205,80,.24); border-radius:21px; background:radial-gradient(circle at 90% 10%,rgba(244,183,40,.16),transparent 38%),linear-gradient(145deg,rgba(45,33,10,.82),rgba(18,18,15,.92)); box-shadow:inset 0 1px 0 rgba(255,255,255,.04); }
        .estimateTop { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
        .estimateEyebrow { color:#f8bc2e; font-size:.66rem; font-weight:950; letter-spacing:.1em; text-transform:uppercase; }
        h2 { margin:5px 0 0; color:#f7f3e8; font-size:1.02rem; line-height:1.25; letter-spacing:-.025em; }
        .estimateBadge { flex:0 0 auto; min-height:27px; padding:0 9px; display:inline-flex; align-items:center; border:1px solid rgba(255,205,80,.26); border-radius:999px; background:rgba(244,183,40,.11); color:#ffd45f; font-size:.66rem; font-weight:950; }
        .estimateAmount { margin-top:17px; padding:15px; border:1px solid rgba(255,205,80,.16); border-radius:16px; background:rgba(244,183,40,.07); }
        .estimateAmount strong { display:block; color:#ffd45f; font-size:clamp(1.45rem,7vw,2rem); line-height:1.1; font-variant-numeric:tabular-nums; letter-spacing:-.04em; }
        .estimateAmount span { display:block; margin-top:6px; color:#aca697; font-size:.72rem; font-weight:800; }
        .estimateMeta { margin-top:9px; display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .estimateMeta > span { min-width:0; padding:11px; display:grid; gap:4px; border:1px solid rgba(255,255,255,.06); border-radius:13px; background:rgba(255,255,255,.025); }
        .estimateMeta small { color:#817c72; font-size:.62rem; line-height:1.35; }
        .estimateMeta strong { color:#e9e3d4; font-size:.8rem; font-variant-numeric:tabular-nums; }
        .estimateDisclaimer,.estimatePending { margin:12px 0 0; color:#89847a; font-size:.69rem; line-height:1.55; }
        .estimatePending { color:#a49e91; }
        @media (max-width:420px) { .estimateMeta { grid-template-columns:1fr; } }
      `}</style>
    </section>,
    mount,
  );
}
