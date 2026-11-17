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

test('reward-ready notifications tell users to check claim status, never claim paid', () => {
  const readyLines = source.split('\n').filter((line) => line.includes('rewardReadyBody:'));
  assert.equal(readyLines.length, 29);
  for (const expected of [
    "rewardReadyBody: 'Your friend's missions are complete. Check your reward claim status in VeInvite.'",
    "rewardReadyBody: '친구가 미션을 완료했어요. VeInvite에서 보상 수령 상태를 확인해 주세요.'",
    "rewardReadyBody: '好友已完成任务。请在 VeInvite 中查看奖励领取状态。'",
    "rewardReadyBody: '友だちがミッションを完了しました。VeInviteで報酬の受け取り状況を確認してください。'",
    "rewardReadyBody: 'Tu amigo completó las misiones. Consulta el estado del cobro de tu recompensa en VeInvite.'",
    "rewardReadyBody: 'Votre ami a terminé les missions. Vérifiez le statut de votre récompense dans VeInvite.'",
    "rewardReadyBody: 'Bạn của bạn đã hoàn thành nhiệm vụ. Hãy kiểm tra trạng thái nhận thưởng trên VeInvite.'",
    "rewardReadyBody: '好友已完成任務。請在 VeInvite 查看獎勵領取狀態。'",
  ]) {
    assert.ok(source.includes(expected), `missing translated claim-ready copy: ${expected}`);
  }
  for (const outdated of [
    'Your reward is confirmed, and you can invite another friend now.',
    '보상이 확정됐고 이제 다른 친구를 초대할 수 있어요.',
  ]) {
    assert.ok(!source.includes(outdated));
  }
});

test('Vietnamese recent-notification wording reads naturally and agrees in number', () => {
  assert.ok(source.includes("dappProgressTitle: 'Tiến độ của người bạn đã được cập nhật'"));
  assert.ok(source.includes("summaryBody: 'Một số người bạn đã có thêm tiến triển khi bạn không mở ứng dụng. Đây là trạng thái đã xác minh mới nhất của họ.'"));
});

test('recent notification copy keeps register and plural agreement consistent', () => {
  for (const expected of [
    "rewardReadyTitle: 'Votre ami a terminé toutes les missions !'",
    "summaryBody: 'Varios amigos avanzaron mientras no estabas. Aquí tienes sus estados verificados más recientes.'",
    "dappProgressTitle: 'Arkadaşının ilerlemesi güncellendi'",
    "dappProgressTitle: 'Progres teman Anda diperbarui'",
    "summaryTitle: 'Progrese noi ale prietenilor'",
    "dappProgressBody: 'Your friend don finish another dApp wey qualify and collect the B3TR reward for am.'",
  ]) {
    assert.ok(source.includes(expected), `missing reviewed natural wording: ${expected}`);
  }

  for (const retired of [
    "rewardReadyTitle: 'Ton ami",
    'Temanmu',
    'Reward-mu',
    'Arkadaş ilerlemesi',
    'another correct dApp',
  ]) {
    assert.ok(!source.includes(retired), `mixed or awkward wording returned: ${retired}`);
  }
});
