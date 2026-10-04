import type { SupportedLocale } from './locales';

type RewardAdjustedCopy = {
  title: string;
  body: string;
};

const COPY: Partial<Record<SupportedLocale, RewardAdjustedCopy>> = {
  en: {
    title: 'Referral reward update',
    body: 'Your referral reward was adjusted under VeInvite reward policy. The successful referral was still recorded.',
  },
  ko: {
    title: '초대 보상 안내',
    body: '친구 초대 보상이 VeInvite 보상 정책에 따라 조정되었습니다. 정상 초대 활동은 기록되었습니다.',
  },
  tr: {
    title: 'Davet ödülü güncellemesi',
    body: 'Davet ödülünüz VeInvite ödül politikasına göre ayarlandı. Geçerli davet başarınız kaydedildi.',
  },
  vi: {
    title: 'Cập nhật phần thưởng giới thiệu',
    body: 'Phần thưởng giới thiệu của bạn đã được điều chỉnh theo chính sách phần thưởng của VeInvite. Lượt giới thiệu hợp lệ vẫn được ghi nhận.',
  },
};

export function rewardAdjustedCopy(
  locale: SupportedLocale,
): RewardAdjustedCopy {
  return COPY[locale] ?? COPY.en!;
}
