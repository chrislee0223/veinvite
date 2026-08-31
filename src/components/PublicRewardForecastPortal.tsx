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
  title: string;
  perInvite: string;
  disclaimer: string;
  pendingTitle: string;
  pendingDescription: string;
  unavailable: string;
};

const COPY: Record<Locale, ForecastCopy> = {
  en: {
    eyebrow: 'ESTIMATED REWARD',
    title: 'If you start inviting now',
    perInvite: 'Estimated per successful invite',
    disclaimer:
      'Estimated rewards can change with actual allocation amounts and participation, and are not guaranteed.',
    pendingTitle: 'Estimate coming soon',
    pendingDescription:
      'The estimate will appear automatically when VeInvite has enough real allocation data.',
    unavailable: 'The reward estimate is temporarily unavailable.',
  },
  ko: {
    eyebrow: '예상 보상',
    title: '지금 초대를 시작한다면',
    perInvite: '성공한 초대 1건 예상',
    disclaimer:
      '예상 보상은 실제 배정량과 참여자 수에 따라 달라질 수 있으며 확정 보상이 아닙니다.',
    pendingTitle: '예상 보상 준비 중',
    pendingDescription:
      'VeInvite의 실제 배정 데이터가 충분해지면 예상 보상이 자동으로 표시돼요.',
    unavailable: '지금은 예상 보상을 불러올 수 없어요.',
  },
  zh: {
    eyebrow: '预计奖励',
    title: '如果现在开始邀请',
    perInvite: '每次成功邀请的预计奖励',
    disclaimer:
      '预计奖励会根据实际分配金额和参与人数发生变化，并非保证金额。',
    pendingTitle: '预计奖励准备中',
    pendingDescription:
      '当 VeInvite 积累足够的实际分配数据后，预计奖励会自动显示。',
    unavailable: '暂时无法获取预计奖励。',
  },
  hi: {
    eyebrow: 'अनुमानित इनाम',
    title: 'अगर आप अभी आमंत्रित करना शुरू करें',
    perInvite: 'हर सफल आमंत्रण का अनुमान',
    disclaimer:
      'अनुमानित इनाम वास्तविक आवंटन और भागीदारी के अनुसार बदल सकता है और इसकी गारंटी नहीं है।',
    pendingTitle: 'अनुमान तैयार हो रहा है',
    pendingDescription:
      'पर्याप्त वास्तविक आवंटन डेटा मिलने के बाद अनुमान अपने-आप दिखाई देगा।',
    unavailable: 'फिलहाल इनाम का अनुमान उपलब्ध नहीं है।',
  },
  es: {
    eyebrow: 'RECOMPENSA ESTIMADA',
    title: 'Si empiezas a invitar ahora',
    perInvite: 'Estimación por invitación completada',
    disclaimer:
      'La recompensa estimada puede cambiar según la asignación real y el número de participantes, y no está garantizada.',
    pendingTitle: 'Estimación en preparación',
    pendingDescription:
      'La estimación aparecerá automáticamente cuando VeInvite tenga suficientes datos reales de asignación.',
    unavailable: 'La estimación de recompensa no está disponible temporalmente.',
  },
  ja: {
    eyebrow: '予想報酬',
    title: '今から招待を始めた場合',
    perInvite: '招待成功1件あたりの予想',
    disclaimer:
      '予想報酬は実際の配分額や参加人数によって変動し、確定した報酬ではありません。',
    pendingTitle: '予想報酬を準備中',
    pendingDescription:
      'VeInviteに十分な実配分データが蓄積されると、予想報酬が自動表示されます。',
    unavailable: '現在、予想報酬を取得できません。',
  },
  it: {
    eyebrow: 'RICOMPENSA STIMATA',
    title: 'Se inizi a invitare ora',
    perInvite: 'Stima per invito completato',
    disclaimer:
      'La ricompensa stimata può variare in base all’allocazione effettiva e al numero di partecipanti e non è garantita.',
    pendingTitle: 'Stima in preparazione',
    pendingDescription:
      'La stima apparirà automaticamente quando VeInvite avrà dati reali sufficienti sulle allocazioni.',
    unavailable: 'La stima della ricompensa non è temporaneamente disponibile.',
  },
  tr: {
    eyebrow: 'TAHMİNİ ÖDÜL',
    title: 'Şimdi davet etmeye başlarsan',
    perInvite: 'Başarılı davet başına tahmin',
    disclaimer:
      'Tahmini ödül gerçek tahsis miktarına ve katılımcı sayısına göre değişebilir ve garanti edilmez.',
    pendingTitle: 'Tahmin hazırlanıyor',
    pendingDescription:
      'VeInvite yeterli gerçek tahsis verisine ulaştığında tahmin otomatik olarak görünecek.',
    unavailable: 'Ödül tahmini geçici olarak kullanılamıyor.',
  },
  nl: {
    eyebrow: 'GESCHATTE BELONING',
    title: 'Als je nu begint met uitnodigen',
    perInvite: 'Schatting per voltooide uitnodiging',
    disclaimer:
      'De geschatte beloning kan veranderen op basis van de werkelijke toewijzing en het aantal deelnemers en is niet gegarandeerd.',
    pendingTitle: 'Schatting wordt voorbereid',
    pendingDescription:
      'De schatting verschijnt automatisch zodra VeInvite voldoende echte allocatiegegevens heeft.',
    unavailable: 'De beloningsschatting is tijdelijk niet beschikbaar.',
  },
  de: {
    eyebrow: 'GESCHÄTZTE BELOHNUNG',
    title: 'Wenn du jetzt mit dem Einladen beginnst',
    perInvite: 'Schätzung pro erfolgreicher Einladung',
    disclaimer:
      'Die geschätzte Belohnung kann sich je nach tatsächlicher Zuteilung und Teilnehmerzahl ändern und ist nicht garantiert.',
    pendingTitle: 'Schätzung wird vorbereitet',
    pendingDescription:
      'Die Schätzung erscheint automatisch, sobald VeInvite genügend echte Zuteilungsdaten hat.',
    unavailable: 'Die Belohnungsschätzung ist vorübergehend nicht verfügbar.',
  },
  fr: {
    eyebrow: 'RÉCOMPENSE ESTIMÉE',
    title: 'Si vous commencez à inviter maintenant',
    perInvite: 'Estimation par invitation réussie',
    disclaimer:
      'La récompense estimée peut varier selon l’allocation réelle et le nombre de participants et n’est pas garantie.',
    pendingTitle: 'Estimation en préparation',
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
  if (!/^\d+$/.test(value)) return '0';
  const normalized = value.replace(/^0+(?=\d)/, '');
  const padded = normalized.padStart(19, '0');
  const whole = padded.slice(0, -18);
  const fraction = padded.slice(-18, -14).replace(/0+$/, '');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${groupedWhole}.${fraction}` : groupedWhole;
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
    >
      <div className="estimateTop">
        <div>
          <span className="estimateEyebrow">{t.eyebrow}</span>
          <h2>
            {forecast?.status === 'ready'
              ? t.title
              : t.pendingTitle}
          </h2>
        </div>
        <span className="estimateBadge">B3TR</span>
      </div>

      {unavailable ? (
        <p className="estimatePending">{t.unavailable}</p>
      ) : forecast?.status === 'ready' ? (
        <>
          <div className="estimateAmount">
            <strong>
              ≈ {formatRewardWei(forecast.estimatedRewardWei)} B3TR
            </strong>
            <span>{t.perInvite}</span>
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
        }
        .estimateTop {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:14px;
        }
        .estimateEyebrow {
          color:#f8bc2e;
          font-size:.66rem;
          font-weight:950;
          letter-spacing:.1em;
          text-transform:uppercase;
        }
        h2 {
          margin:5px 0 0;
          color:#f7f3e8;
          font-size:1.02rem;
          line-height:1.3;
          letter-spacing:-.025em;
        }
        .estimateBadge {
          flex:0 0 auto;
          min-height:27px;
          padding:0 9px;
          display:inline-flex;
          align-items:center;
          border:1px solid rgba(255,205,80,.26);
          border-radius:999px;
          background:rgba(244,183,40,.11);
          color:#ffd45f;
          font-size:.66rem;
          font-weight:950;
        }
        .estimateAmount {
          margin-top:17px;
          padding:17px 15px;
          border:1px solid rgba(255,205,80,.16);
          border-radius:16px;
          background:rgba(244,183,40,.07);
          text-align:center;
        }
        .estimateAmount strong {
          display:block;
          color:#ffd45f;
          font-size:clamp(1.45rem,7vw,2rem);
          line-height:1.12;
          font-variant-numeric:tabular-nums;
          letter-spacing:-.04em;
        }
        .estimateAmount span {
          display:block;
          margin-top:7px;
          color:#aca697;
          font-size:.72rem;
          font-weight:800;
        }
        .estimateDisclaimer,.estimatePending {
          max-width:440px;
          margin:13px auto 0;
          color:#8f8a80;
          font-size:.69rem;
          line-height:1.6;
          text-align:center;
        }
        .estimatePending {
          color:#a49e91;
        }
        @media (max-width:420px) {
          .publicRewardEstimateCard {
            padding:15px;
            border-radius:19px;
          }
          .estimateTop {
            gap:10px;
          }
          .estimateAmount {
            padding:16px 12px;
          }
        }
      `}</style>
    </section>,
    mount,
  );
}
