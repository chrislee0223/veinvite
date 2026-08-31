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
      generatedAt: string;
      status: 'pending';
      reason: 'awaiting_first_allocation' | 'insufficient_reward_data';
      basisRoundId: null;
      projectedFundingRoundId: null;
      earliestCompletionRoundId: null;
      estimatedRewardWei: null;
      estimatedRewardLowWei: null;
      estimatedRewardHighWei: null;
      expectedRecipients: null;
      recipientLow: null;
      recipientHigh: null;
      allocationSampleCount: number;
      recipientHistoryRoundCount: number;
      modelVersion: null;
      stale: boolean;
    }
  | {
      generatedAt: string;
      status: 'ready';
      reason: null;
      basisRoundId: number;
      projectedFundingRoundId: number;
      earliestCompletionRoundId: number;
      estimatedRewardWei: string;
      estimatedRewardLowWei: string;
      estimatedRewardHighWei: string;
      expectedRecipients: number;
      recipientLow: number;
      recipientHigh: number;
      allocationSampleCount: number;
      recipientHistoryRoundCount: number;
      modelVersion: string;
      stale: boolean;
    };

type ForecastCopy = {
  eyebrow: string;
  title: string;
  perInvite: string;
  range: string;
  recipients: string;
  earliestRound: string;
  basisRound: string;
  updated: string;
  refreshing: string;
  disclaimer: string;
  pendingTitle: string;
  pendingDescription: string;
  unavailable: string;
};

const COPY: Record<Locale, ForecastCopy> = {
  en: {
    eyebrow: 'ESTIMATED REWARD',
    title: 'If you start inviting now',
    perInvite: 'Expected per successful invite',
    range: 'Expected range',
    recipients: 'Expected reward recipients',
    earliestRound: 'Earliest eligible round',
    basisRound: 'Latest funded data',
    updated: 'Updated',
    refreshing: 'Refreshing from the latest snapshot',
    disclaimer: 'This forecast factors in the earliest round in which the governance-vote mission can be completed, recent VeInvite allocations, and the current participant pipeline. Actual rewards can change and are not guaranteed.',
    pendingTitle: 'Estimate coming soon',
    pendingDescription: 'The forecast will appear automatically after VeInvite has enough real allocation data.',
    unavailable: 'The reward forecast is temporarily unavailable.',
  },
  ko: {
    eyebrow: '예상 보상',
    title: '지금 초대를 시작한다면',
    perInvite: '성공한 초대 1건 예상',
    range: '예상 범위',
    recipients: '예상 보상 대상',
    earliestRound: '가장 빠른 보상 가능 라운드',
    basisRound: '최근 실제 배정 기준',
    updated: '업데이트',
    refreshing: '최근 저장된 예상치를 표시 중이에요',
    disclaimer: '거버넌스 투표 미션까지 완료 가능한 가장 빠른 라운드와 최근 VeInvite 배정량, 현재 참여 현황을 반영한 예상치예요. 실제 배정량과 참여자 수에 따라 달라지며 확정 보상이 아닙니다.',
    pendingTitle: '예측 준비 중',
    pendingDescription: 'VeInvite의 실제 배정 데이터가 충분해지면 예상 보상이 자동으로 표시돼요.',
    unavailable: '지금은 예상 보상을 불러올 수 없어요.',
  },
  zh: {
    eyebrow: '预计奖励',
    title: '如果现在开始邀请',
    perInvite: '每次成功邀请的预计奖励',
    range: '预计范围',
    recipients: '预计奖励人数',
    earliestRound: '最早可获得奖励的轮次',
    basisRound: '最近实际分配数据',
    updated: '更新时间',
    refreshing: '正在显示最近保存的预测',
    disclaimer: '该预测会考虑完成治理投票任务的最早轮次、VeInvite近期分配以及当前参与情况。实际奖励可能变化，并非保证金额。',
    pendingTitle: '正在准备预测',
    pendingDescription: 'VeInvite积累足够的实际分配数据后，预计奖励会自动显示。',
    unavailable: '暂时无法获取奖励预测。',
  },
  hi: {
    eyebrow: 'अनुमानित इनाम',
    title: 'अगर आप अभी आमंत्रित करना शुरू करें',
    perInvite: 'हर सफल आमंत्रण का अनुमान',
    range: 'अनुमानित सीमा',
    recipients: 'अनुमानित इनाम पाने वाले',
    earliestRound: 'सबसे जल्दी पात्र राउंड',
    basisRound: 'नवीनतम वास्तविक आवंटन',
    updated: 'अपडेट',
    refreshing: 'हाल का सहेजा हुआ अनुमान दिखाया जा रहा है',
    disclaimer: 'यह अनुमान गवर्नेंस वोट मिशन पूरा करने के सबसे शुरुआती राउंड, हाल के VeInvite आवंटन और मौजूदा भागीदारी को ध्यान में रखता है। वास्तविक इनाम बदल सकता है और इसकी गारंटी नहीं है।',
    pendingTitle: 'अनुमान तैयार हो रहा है',
    pendingDescription: 'पर्याप्त वास्तविक आवंटन डेटा मिलने के बाद अनुमान अपने-आप दिखाई देगा।',
    unavailable: 'फिलहाल इनाम का अनुमान उपलब्ध नहीं है।',
  },
  es: {
    eyebrow: 'RECOMPENSA ESTIMADA',
    title: 'Si empiezas a invitar ahora',
    perInvite: 'Estimación por invitación completada',
    range: 'Rango estimado',
    recipients: 'Beneficiarios estimados',
    earliestRound: 'Primera ronda posible',
    basisRound: 'Últimos datos financiados',
    updated: 'Actualizado',
    refreshing: 'Mostrando la última previsión guardada',
    disclaimer: 'La previsión tiene en cuenta la primera ronda en la que puede completarse la misión de voto, las asignaciones recientes de VeInvite y la participación actual. La recompensa real puede variar y no está garantizada.',
    pendingTitle: 'Estimación en preparación',
    pendingDescription: 'La previsión aparecerá automáticamente cuando VeInvite tenga suficientes datos reales de asignación.',
    unavailable: 'La previsión de recompensa no está disponible temporalmente.',
  },
  ja: {
    eyebrow: '予想報酬',
    title: '今から招待を始めた場合',
    perInvite: '招待成功1件あたりの予想',
    range: '予想範囲',
    recipients: '予想報酬対象者数',
    earliestRound: '最短の報酬対象ラウンド',
    basisRound: '直近の実配分データ',
    updated: '更新',
    refreshing: '直近に保存された予測を表示中',
    disclaimer: 'ガバナンス投票ミッションを完了できる最短ラウンド、直近のVeInvite配分、現在の参加状況を反映した予想です。実際の報酬は変動する可能性があり、保証額ではありません。',
    pendingTitle: '予測を準備中',
    pendingDescription: 'VeInviteに十分な実配分データが蓄積されると、予想報酬が自動表示されます。',
    unavailable: '現在、報酬予測を取得できません。',
  },
  it: {
    eyebrow: 'RICOMPENSA STIMATA',
    title: 'Se inizi a invitare ora',
    perInvite: 'Stima per invito completato',
    range: 'Intervallo stimato',
    recipients: 'Destinatari stimati',
    earliestRound: 'Primo round possibile',
    basisRound: 'Ultimi dati finanziati',
    updated: 'Aggiornato',
    refreshing: 'Visualizzazione dell’ultima previsione salvata',
    disclaimer: 'La previsione considera il primo round in cui può essere completata la missione di voto, le recenti allocazioni VeInvite e la partecipazione attuale. La ricompensa effettiva può variare e non è garantita.',
    pendingTitle: 'Stima in preparazione',
    pendingDescription: 'La previsione apparirà automaticamente quando VeInvite avrà dati reali sufficienti sulle allocazioni.',
    unavailable: 'La previsione della ricompensa non è temporaneamente disponibile.',
  },
  tr: {
    eyebrow: 'TAHMİNİ ÖDÜL',
    title: 'Şimdi davet etmeye başlarsan',
    perInvite: 'Başarılı davet başına tahmin',
    range: 'Tahmini aralık',
    recipients: 'Tahmini ödül alacak kişi sayısı',
    earliestRound: 'En erken uygun tur',
    basisRound: 'Son gerçek tahsis verisi',
    updated: 'Güncellendi',
    refreshing: 'Son kaydedilen tahmin gösteriliyor',
    disclaimer: 'Tahmin; yönetişim oylaması görevinin tamamlanabileceği en erken turu, son VeInvite tahsislerini ve mevcut katılımı dikkate alır. Gerçek ödül değişebilir ve garanti edilmez.',
    pendingTitle: 'Tahmin hazırlanıyor',
    pendingDescription: 'VeInvite yeterli gerçek tahsis verisine ulaştığında tahmin otomatik olarak görünecek.',
    unavailable: 'Ödül tahmini geçici olarak kullanılamıyor.',
  },
  nl: {
    eyebrow: 'GESCHATTE BELONING',
    title: 'Als je nu begint met uitnodigen',
    perInvite: 'Schatting per voltooide uitnodiging',
    range: 'Geschat bereik',
    recipients: 'Geschat aantal ontvangers',
    earliestRound: 'Vroegste mogelijke ronde',
    basisRound: 'Laatste echte allocatiegegevens',
    updated: 'Bijgewerkt',
    refreshing: 'Laatste opgeslagen prognose wordt getoond',
    disclaimer: 'De prognose houdt rekening met de vroegste ronde waarin de governance-stemmissie kan worden voltooid, recente VeInvite-allocaties en de huidige deelname. De werkelijke beloning kan afwijken en is niet gegarandeerd.',
    pendingTitle: 'Schatting wordt voorbereid',
    pendingDescription: 'De prognose verschijnt automatisch zodra VeInvite voldoende echte allocatiegegevens heeft.',
    unavailable: 'De beloningsprognose is tijdelijk niet beschikbaar.',
  },
  de: {
    eyebrow: 'GESCHÄTZTE BELOHNUNG',
    title: 'Wenn du jetzt mit dem Einladen beginnst',
    perInvite: 'Schätzung pro erfolgreicher Einladung',
    range: 'Geschätzte Spanne',
    recipients: 'Geschätzte Zahl der Empfänger',
    earliestRound: 'Früheste mögliche Runde',
    basisRound: 'Letzte echte Zuteilungsdaten',
    updated: 'Aktualisiert',
    refreshing: 'Letzte gespeicherte Prognose wird angezeigt',
    disclaimer: 'Die Prognose berücksichtigt die früheste Runde, in der die Governance-Abstimmung abgeschlossen werden kann, die letzten VeInvite-Zuteilungen und die aktuelle Teilnahme. Die tatsächliche Belohnung kann abweichen und ist nicht garantiert.',
    pendingTitle: 'Schätzung wird vorbereitet',
    pendingDescription: 'Die Prognose erscheint automatisch, sobald VeInvite genügend echte Zuteilungsdaten hat.',
    unavailable: 'Die Belohnungsprognose ist vorübergehend nicht verfügbar.',
  },
  fr: {
    eyebrow: 'RÉCOMPENSE ESTIMÉE',
    title: 'Si vous commencez à inviter maintenant',
    perInvite: 'Estimation par invitation réussie',
    range: 'Fourchette estimée',
    recipients: 'Nombre estimé de bénéficiaires',
    earliestRound: 'Premier round possible',
    basisRound: 'Dernières données réelles',
    updated: 'Mis à jour',
    refreshing: 'Affichage de la dernière prévision enregistrée',
    disclaimer: 'La prévision tient compte du premier round où la mission de vote peut être terminée, des allocations VeInvite récentes et de la participation actuelle. La récompense réelle peut varier et n’est pas garantie.',
    pendingTitle: 'Estimation en préparation',
    pendingDescription: 'La prévision apparaîtra automatiquement lorsque VeInvite disposera de suffisamment de données réelles d’allocation.',
    unavailable: 'La prévision de récompense est temporairement indisponible.',
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

function localeTag(locale: Locale): string {
  if (locale === 'zh') return 'zh-CN';
  if (locale === 'hi') return 'hi-IN';
  return locale;
}

function formatUpdatedAt(value: string, locale: Locale): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat(localeTag(locale), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function PublicRewardForecastPortal() {
  const [mount, setMount] = useState<HTMLDivElement | null>(null);
  const [locale, setLocale] = useState<Locale>('en');
  const [forecast, setForecast] = useState<RewardForecastResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let activeMount: HTMLDivElement | null = null;

    const detach = () => {
      activeMount?.remove();
      activeMount = null;
      setMount(null);
    };

    const attach = () => {
      const impactCard = document.querySelector<HTMLElement>('.leaderboardPage .impactCard');
      if (!impactCard) return;
      if (activeMount?.isConnected && activeMount.previousElementSibling === impactCard) return;

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

    const loadForecast = () => {
      controller?.abort();
      controller = new AbortController();
      setUnavailable(false);

      void fetch('/api/rewards/estimate', { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error('Reward forecast request failed.');
          return (await response.json()) as RewardForecastResponse;
        })
        .then((result) => {
          if (active) setForecast(result);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          if (active) setUnavailable(true);
        });
    };

    setForecast(null);
    loadForecast();
    const intervalId = window.setInterval(loadForecast, 15 * 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadForecast();
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
          <h2>{forecast?.status === 'ready' ? t.title : t.pendingTitle}</h2>
        </div>
        <span className="estimateBadge">B3TR</span>
      </div>

      {unavailable ? (
        <p className="estimatePending">{t.unavailable}</p>
      ) : forecast?.status === 'ready' ? (
        <>
          <div className="estimateAmount">
            <strong>≈ {formatRewardWei(forecast.estimatedRewardWei)} B3TR</strong>
            <span>{t.perInvite}</span>
          </div>

          <div className="estimateRange">
            <small>{t.range}</small>
            <strong>
              {formatRewardWei(forecast.estimatedRewardLowWei)}–{formatRewardWei(forecast.estimatedRewardHighWei)} B3TR
            </strong>
          </div>

          <div className="estimateMeta">
            <span>
              <small>{t.recipients}</small>
              <strong>{forecast.recipientLow}–{forecast.recipientHigh}</strong>
            </span>
            <span>
              <small>{t.earliestRound}</small>
              <strong>#{forecast.earliestCompletionRoundId}</strong>
            </span>
            <span>
              <small>{t.basisRound}</small>
              <strong>#{forecast.basisRoundId}</strong>
            </span>
            <span>
              <small>{t.updated}</small>
              <strong>{formatUpdatedAt(forecast.generatedAt, locale)}</strong>
            </span>
          </div>

          {forecast.stale ? <p className="estimateRefresh">{t.refreshing}</p> : null}
          <p className="estimateDisclaimer">{t.disclaimer}</p>
        </>
      ) : (
        <p className="estimatePending">{t.pendingDescription}</p>
      )}

      <style jsx>{`
        .publicRewardEstimateCard { margin-top:18px; padding:18px; border:1px solid rgba(255,205,80,.24); border-radius:21px; background:radial-gradient(circle at 90% 10%,rgba(244,183,40,.16),transparent 38%),linear-gradient(145deg,rgba(45,33,10,.82),rgba(18,18,15,.92)); box-shadow:inset 0 1px 0 rgba(255,255,255,.04); }
        .estimateTop { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
        .estimateEyebrow { color:#f8bc2e; font-size:.66rem; font-weight:950; letter-spacing:.1em; text-transform:uppercase; }
        h2 { margin:5px 0 0; color:#f7f3e8; font-size:1.02rem; line-height:1.3; letter-spacing:-.025em; }
        .estimateBadge { flex:0 0 auto; min-height:27px; padding:0 9px; display:inline-flex; align-items:center; border:1px solid rgba(255,205,80,.26); border-radius:999px; background:rgba(244,183,40,.11); color:#ffd45f; font-size:.66rem; font-weight:950; }
        .estimateAmount { margin-top:17px; padding:15px; border:1px solid rgba(255,205,80,.16); border-radius:16px; background:rgba(244,183,40,.07); }
        .estimateAmount strong { display:block; color:#ffd45f; font-size:clamp(1.4rem,7vw,2rem); line-height:1.1; font-variant-numeric:tabular-nums; letter-spacing:-.04em; }
        .estimateAmount span { display:block; margin-top:6px; color:#aca697; font-size:.72rem; font-weight:800; }
        .estimateRange { margin-top:9px; padding:11px 13px; display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid rgba(255,255,255,.06); border-radius:13px; background:rgba(255,255,255,.025); }
        .estimateRange small { color:#817c72; font-size:.65rem; }
        .estimateRange strong { color:#e9e3d4; font-size:.77rem; text-align:right; font-variant-numeric:tabular-nums; }
        .estimateMeta { margin-top:9px; display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .estimateMeta > span { min-width:0; padding:11px; display:grid; gap:4px; border:1px solid rgba(255,255,255,.06); border-radius:13px; background:rgba(255,255,255,.025); }
        .estimateMeta small { color:#817c72; font-size:.62rem; line-height:1.35; }
        .estimateMeta strong { color:#e9e3d4; font-size:.8rem; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
        .estimateDisclaimer,.estimatePending,.estimateRefresh { margin:12px 0 0; color:#89847a; font-size:.69rem; line-height:1.55; }
        .estimateRefresh { color:#b7a56f; }
        .estimatePending { color:#a49e91; }
        @media (max-width:420px) { .estimateMeta { grid-template-columns:1fr; } .estimateRange { align-items:flex-start; flex-direction:column; } .estimateRange strong { text-align:left; } }
      `}</style>
    </section>,
    mount,
  );
}
