'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  isLocale,
  localeFromLanguageTag,
  type Locale,
} from '@/lib/i18n/locales';

type RewardForecastResponse =
  | {
      status: 'pending';
      estimatedRewardWei: null;
    }
  | {
      status: 'ready';
      estimatedRewardWei: string;
    };

type ForecastCopy = {
  eyebrow: string;
  eligibility: string;
  disclaimer: string;
  pendingTitle: string;
  pendingDescription: string;
  unavailable: string;
};

const COPY: Record<Locale, ForecastCopy> = {
  en: {
    eyebrow: 'ESTIMATED INVITE REWARD',
    eligibility:
      'You can receive it when your invited friend completes all missions.',
    disclaimer:
      'The estimated reward may change with allocation and participation.',
    pendingTitle: 'Invite reward estimate coming soon',
    pendingDescription:
      'The estimate will appear automatically when VeInvite has enough real allocation data.',
    unavailable: 'The reward estimate is temporarily unavailable.',
  },
  ko: {
    eyebrow: '예상 초대 보상',
    eligibility:
      '친구가 모든 미션을 완료하면 받을 수 있습니다.',
    disclaimer:
      '예상 보상은 할당량과 참여 현황에 따라 달라질 수 있습니다.',
    pendingTitle: '예상 초대 보상 준비 중',
    pendingDescription:
      'VeInvite의 실제 할당 데이터가 충분해지면 예상 보상이 자동으로 표시됩니다.',
    unavailable: '지금은 예상 보상을 불러올 수 없습니다.',
  },
  zh: {
    eyebrow: '预计邀请奖励',
    eligibility:
      '你邀请的好友完成全部任务后，你就可以获得奖励。',
    disclaimer:
      '预计奖励会根据分配额度和参与情况发生变化。',
    pendingTitle: '邀请奖励预估准备中',
    pendingDescription:
      '当 VeInvite 积累足够的实际分配数据后，预计奖励会自动显示。',
    unavailable: '暂时无法获取预计奖励。',
  },
  hi: {
    eyebrow: 'अनुमानित आमंत्रण इनाम',
    eligibility:
      'आपके आमंत्रित मित्र के सभी मिशन पूरे करने पर आप यह इनाम पा सकते हैं।',
    disclaimer:
      'अनुमानित इनाम आवंटन और भागीदारी के अनुसार बदल सकता है।',
    pendingTitle: 'आमंत्रण इनाम का अनुमान तैयार हो रहा है',
    pendingDescription:
      'पर्याप्त वास्तविक आवंटन डेटा मिलने के बाद अनुमान अपने-आप दिखाई देगा।',
    unavailable: 'फिलहाल इनाम का अनुमान उपलब्ध नहीं है।',
  },
  es: {
    eyebrow: 'RECOMPENSA ESTIMADA POR INVITACIÓN',
    eligibility:
      'Puedes recibirla cuando el amigo que invitaste complete todas las misiones.',
    disclaimer:
      'La estimación puede variar según la asignación y la participación.',
    pendingTitle: 'Estimación de recompensa en preparación',
    pendingDescription:
      'La estimación aparecerá automáticamente cuando VeInvite tenga suficientes datos reales de asignación.',
    unavailable: 'La estimación de recompensa no está disponible temporalmente.',
  },
  ja: {
    eyebrow: '招待報酬の予想',
    eligibility:
      '招待した友だちがすべてのミッションを完了すると受け取れます。',
    disclaimer:
      '予想報酬は配分額や参加状況により変動する場合があります。',
    pendingTitle: '招待報酬を予想中',
    pendingDescription:
      'VeInviteに十分な実配分データが蓄積されると、予想報酬が自動表示されます。',
    unavailable: '現在、予想報酬を取得できません。',
  },
  it: {
    eyebrow: 'RICOMPENSA INVITO STIMATA',
    eligibility:
      'Puoi riceverla quando l’amico che hai invitato completa tutte le missioni.',
    disclaimer:
      'La stima può variare in base all’allocazione e alla partecipazione.',
    pendingTitle: 'Stima della ricompensa in preparazione',
    pendingDescription:
      'La stima apparirà automaticamente quando VeInvite avrà dati reali sufficienti sulle allocazioni.',
    unavailable: 'La stima della ricompensa è temporaneamente non disponibile.',
  },
  tr: {
    eyebrow: 'TAHMİNİ DAVET ÖDÜLÜ',
    eligibility:
      'Davet ettiğin arkadaşın tüm görevleri tamamladığında bu ödülü alabilirsin.',
    disclaimer:
      'Tahmini ödül, tahsis ve katılıma göre değişebilir.',
    pendingTitle: 'Davet ödülü tahmini hazırlanıyor',
    pendingDescription:
      'VeInvite yeterli gerçek tahsis verisine ulaştığında tahmin otomatik olarak görünecek.',
    unavailable: 'Ödül tahmini geçici olarak kullanılamıyor.',
  },
  nl: {
    eyebrow: 'GESCHATTE UITNODIGINGSBELONING',
    eligibility:
      'Je kunt deze ontvangen zodra de vriend die je hebt uitgenodigd alle missies voltooit.',
    disclaimer:
      'De schatting kan veranderen door de toewijzing en deelname.',
    pendingTitle: 'Beloningsschatting wordt voorbereid',
    pendingDescription:
      'De schatting verschijnt automatisch zodra VeInvite voldoende werkelijke toewijzingsgegevens heeft.',
    unavailable: 'De beloningsschatting is tijdelijk niet beschikbaar.',
  },
  de: {
    eyebrow: 'GESCHÄTZTE EINLADUNGSBELOHNUNG',
    eligibility:
      'Du kannst sie erhalten, sobald dein eingeladener Freund alle Missionen abgeschlossen hat.',
    disclaimer:
      'Die Schätzung kann sich je nach Zuteilung und Teilnahme ändern.',
    pendingTitle: 'Belohnungsschätzung wird vorbereitet',
    pendingDescription:
      'Die Schätzung erscheint automatisch, sobald VeInvite über ausreichend tatsächliche Zuteilungsdaten verfügt.',
    unavailable: 'Die Belohnungsschätzung ist vorübergehend nicht verfügbar.',
  },
  fr: {
    eyebrow: 'RÉCOMPENSE D’INVITATION ESTIMÉE',
    eligibility:
      'Vous pouvez la recevoir lorsque votre ami invité termine toutes les missions.',
    disclaimer:
      'L’estimation peut varier selon l’allocation et la participation.',
    pendingTitle: 'Estimation de la récompense en préparation',
    pendingDescription:
      'L’estimation apparaîtra automatiquement lorsque VeInvite disposera de suffisamment de données réelles d’allocation.',
    unavailable: 'L’estimation de récompense est temporairement indisponible.',
  },
};

const PREVIEW_FORECAST: RewardForecastResponse = {
  status: 'ready',
  estimatedRewardWei: '147740500000000000000',
};

function formatRewardWei(value: string): string {
  if (!/^\d+$/.test(value)) return '0.00';

  const wei = BigInt(value);
  const hundredthWei = 10n ** 16n;
  const roundedHundredths =
    (wei + hundredthWei / 2n) / hundredthWei;
  const whole = (roundedHundredths / 100n).toString();
  const fraction = (roundedHundredths % 100n)
    .toString()
    .padStart(2, '0');
  const groupedWhole = whole.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ',',
  );

  return `${groupedWhole}.${fraction}`;
}

export function PublicRewardForecastPortal() {
  const [mount, setMount] = useState<HTMLDivElement | null>(null);
  const [locale, setLocale] = useState<Locale>('en');
  const [forecast, setForecast] =
    useState<RewardForecastResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    let activeMount: HTMLDivElement | null = null;
    let attachFrame: number | null = null;

    const detach = () => {
      activeMount?.remove();
      activeMount = null;
      setMount(null);
      setPreview(false);
    };

    const attach = () => {
      const impactCard = document.querySelector<HTMLElement>(
        '.leaderboardPage .impactCard',
      );
      if (!impactCard) {
        if (activeMount) detach();
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
      setPreview(
        impactCard.dataset.rewardForecastPreview === 'true',
      );
      setMount(nextMount);
    };

    const scheduleAttach = () => {
      if (attachFrame !== null) return;
      attachFrame = window.requestAnimationFrame(() => {
        attachFrame = null;
        attach();
      });
    };

    attach();
    const observer = new MutationObserver(scheduleAttach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (attachFrame !== null) {
        window.cancelAnimationFrame(attachFrame);
      }
      detach();
    };
  }, []);

  useEffect(() => {
    const syncFromDocument = () => {
      const next = localeFromLanguageTag(
        document.documentElement.lang,
      );
      if (next) setLocale(next);
    };
    const syncFromEvent = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isLocale(detail)) setLocale(detail);
    };

    syncFromDocument();
    window.addEventListener(
      'veinvite-language-change',
      syncFromEvent,
    );
    return () =>
      window.removeEventListener(
        'veinvite-language-change',
        syncFromEvent,
      );
  }, []);

  useEffect(() => {
    if (!mount) return;

    if (preview) {
      setUnavailable(false);
      setForecast(PREVIEW_FORECAST);
      return;
    }

    let active = true;
    let controller: AbortController | null = null;

    const loadForecast = () => {
      controller?.abort();
      controller = new AbortController();
      setUnavailable(false);

      void fetch('/api/rewards/estimate', {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error('Reward forecast request failed.');
          }
          return (await response.json()) as RewardForecastResponse;
        })
        .then((result) => {
          if (active) setForecast(result);
        })
        .catch((error: unknown) => {
          if (
            error instanceof DOMException &&
            error.name === 'AbortError'
          ) {
            return;
          }
          if (active) setUnavailable(true);
        });
    };

    setForecast(null);
    loadForecast();
    const intervalId = window.setInterval(
      loadForecast,
      15 * 60_000,
    );
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadForecast();
    };
    document.addEventListener(
      'visibilitychange',
      refreshWhenVisible,
    );

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener(
        'visibilitychange',
        refreshWhenVisible,
      );
      controller?.abort();
    };
  }, [mount, preview]);

  if (!mount) return null;
  const t = COPY[locale];

  return createPortal(
    <section
      className="publicRewardEstimateCard"
      aria-live="polite"
      lang={locale}
    >
      <div className="estimateTop">
        <span className="estimateEyebrow">{t.eyebrow}</span>
        <h2>
          {forecast?.status === 'ready'
            ? t.eligibility
            : t.pendingTitle}
        </h2>
      </div>

      {unavailable ? (
        <p className="estimatePending">{t.unavailable}</p>
      ) : forecast?.status === 'ready' ? (
        <>
          <div className="estimateAmount">
            <strong>
              {formatRewardWei(forecast.estimatedRewardWei)} B3TR
            </strong>
          </div>
          <p className="estimateDisclaimer">{t.disclaimer}</p>
        </>
      ) : (
        <p className="estimatePending">
          {t.pendingDescription}
        </p>
      )}

      <style jsx>{`
        .publicRewardEstimateCard {
          margin-top:18px;
          padding:18px;
          border:1px solid rgba(255,205,80,.24);
          border-radius:21px;
          background:radial-gradient(circle at 90% 10%,rgba(244,183,40,.16),transparent 38%),linear-gradient(145deg,rgba(45,33,10,.82),rgba(18,18,15,.92));
          box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
          min-width:0;
        }
        .estimateTop {
          display:block;
          min-width:0;
          max-width:100%;
        }
        .estimateEyebrow {
          display:block;
          max-width:100%;
          color:#f8bc2e;
          font-size:clamp(.58rem,2.6vw,.66rem);
          font-weight:950;
          line-height:1.45;
          letter-spacing:.08em;
          text-transform:uppercase;
          overflow-wrap:anywhere;
          word-break:normal;
          hyphens:auto;
        }
        h2 {
          max-width:100%;
          margin:5px 0 0;
          color:#f7f3e8;
          font-size:clamp(.92rem,4vw,1.02rem);
          line-height:1.45;
          letter-spacing:-.025em;
          overflow-wrap:break-word;
          word-break:normal;
          hyphens:auto;
          text-wrap:pretty;
        }
        .estimateAmount {
          min-width:0;
          margin-top:17px;
          padding:17px 15px;
          border:1px solid rgba(255,205,80,.16);
          border-radius:16px;
          background:rgba(244,183,40,.07);
          text-align:center;
        }
        .estimateAmount strong {
          display:block;
          max-width:100%;
          color:#ffd45f;
          font-size:clamp(1.3rem,7vw,2rem);
          line-height:1.15;
          font-variant-numeric:tabular-nums;
          letter-spacing:-.04em;
          white-space:nowrap;
        }
        .estimateDisclaimer,.estimatePending {
          max-width:440px;
          margin:13px auto 0;
          color:#8f8a80;
          font-size:.69rem;
          line-height:1.65;
          text-align:center;
          overflow-wrap:break-word;
          word-break:normal;
          hyphens:auto;
          text-wrap:pretty;
        }
        .estimatePending {
          color:#a49e91;
        }
        @media (max-width:420px) {
          .publicRewardEstimateCard {
            padding:15px;
            border-radius:19px;
          }
          .estimateAmount {
            padding:16px 10px;
          }
          .estimateAmount strong {
            font-size:clamp(1.22rem,6.7vw,1.75rem);
          }
        }
        @media (max-width:340px) {
          .publicRewardEstimateCard {
            padding:13px;
          }
          .estimateAmount {
            padding:15px 8px;
          }
          .estimateAmount strong {
            font-size:1.2rem;
          }
        }
      `}</style>
    </section>,
    mount,
  );
}
