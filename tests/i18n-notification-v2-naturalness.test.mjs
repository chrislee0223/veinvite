import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync('src/lib/i18n/notificationV2Copy.ts', 'utf8');

test('reward-ready notifications avoid mechanical friend-slot translations', () => {
  const retiredSlotPhrases = [
    'friend slot',
    '친구 슬롯',
    'फ्रेंड स्लॉट',
    'espacio de amigo',
    '友だちスロット',
    'slot amico',
    'arkadaş slotu',
    'vriendenslot',
    'Freundes-Slot',
    'créneau ami',
    'مكان الصديق',
    'বন্ধুর স্লট',
    'espaço de amigo',
    'слот друга',
    'slot teman',
    'ô bạn bè',
    'vänplatsen',
    'slotul de prieten',
    'دوست کا سلاٹ',
    'मित्र स्लॉट',
    'ఫ్రెండ్ స్లాట్',
    'nafasi ya rafiki',
    'gurbin aboki',
    'θέση φίλου',
  ];

  for (const phrase of retiredSlotPhrases) {
    assert.ok(
      !source.toLowerCase().includes(phrase.toLowerCase()),
      `notification copy regressed to mechanical slot wording: ${phrase}`,
    );
  }
});

test('reward-ready copy says the user can invite another friend in reviewed locales', () => {
  for (const expected of [
    'Your reward is confirmed, and you can invite another friend now.',
    '보상이 확정됐고 이제 다른 친구를 초대할 수 있어요.',
    '奖励已确认，现在可以邀请下一位好友了。',
    '報酬額が確定しました。これで次の友だちを招待できます。',
    'Tu recompensa está confirmada y ya puedes invitar a otro amigo.',
    'Votre récompense est confirmée et vous pouvez maintenant inviter un autre ami.',
    'Phần thưởng của bạn đã được xác nhận và giờ bạn có thể mời thêm một người bạn.',
    '獎勵已確認，現在可以邀請下一位好友了。',
    'تم تأكيد مكافأتك ويمكنك الآن دعوة صديق آخر.',
    'آپ کا انعام طے ہو گیا ہے اور اب آپ کسی اور دوست کو دعوت دے سکتے ہیں۔',
  ]) {
    assert.ok(source.includes(expected), `missing reviewed reward-ready wording: ${expected}`);
  }
});

test('Vietnamese recent-notification wording reads naturally and agrees in number', () => {
  assert.ok(source.includes("dappProgressTitle: 'Tiến độ của người bạn đã được cập nhật'"));
  assert.ok(source.includes("summaryBody: 'Một số người bạn đã có thêm tiến triển khi bạn không mở ứng dụng. Đây là trạng thái đã xác minh mới nhất của họ.'"));
});
