import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const read = (path) =>
  readFileSync(join(root, path), 'utf8');

const settings = read(
  'src/lib/i18n/settingsCopy.ts',
);
const languageSync = read(
  'src/components/WalletLanguagePreferenceSync.tsx',
);
const supabaseServer = read(
  'src/lib/supabaseServer.ts',
);

const localeKeys = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja',
  'it', 'tr', 'nl', 'de', 'fr',
];

for (const locale of localeKeys) {
  if (!new RegExp(`\\b${locale}:\\s*\\{`).test(settings)) {
    failures.push(
      `Settings copy is incomplete for locale: ${locale}`,
    );
  }
}

const persistedLanguageCopy = [
  'Your language choice is saved for your next visit.',
  '선택한 언어는 저장되어 다시 접속해도 유지돼요.',
  '你选择的语言会保存，下次回来时自动恢复。',
  'आपकी चुनी हुई भाषा सेव रहती है और अगली बार लौटने पर फिर लागू हो जाती है।',
  'El idioma que elijas queda guardado para tu próxima visita.',
  '選んだ言語は保存され、次回アクセス時にも自動で復元されます。',
  'La lingua scelta resta salvata anche quando torni.',
  'Seçtiğin dil kaydedilir ve bir sonraki ziyaretinde de kullanılır.',
  'Je taalkeuze wordt opgeslagen en blijft behouden als je later terugkomt.',
  'Deine Sprachauswahl wird gespeichert und bleibt bei deinem nächsten Besuch erhalten.',
  'La langue choisie est enregistrée et restaurée lors de votre prochaine visite.',
];

for (const copy of persistedLanguageCopy) {
  if (!settings.includes(copy)) {
    failures.push(
      `Settings language persistence copy is missing: ${copy}`,
    );
  }
}

if (
  /saved on this device|이 기기에 저장돼요|这台设备|इस डिवाइस|este dispositivo|この端末|questo dispositivo|bu cihazda|dit apparaat|diesem Gerät|cet appareil/i.test(
    settings,
  )
) {
  failures.push(
    'Settings still describes language persistence as device-only even though verified-wallet persistence is enabled.',
  );
}

if (
  /saved and restored when you return|se guarda y se restaura cuando vuelves|viene salvata e ripristinata quando torni|tekrar geldiğinde geri yüklenir|opgeslagen en hersteld wanneer je terugkomt|bei deiner Rückkehr wiederhergestellt/i.test(
    settings,
  )
) {
  failures.push(
    'Settings language persistence copy regressed to the reviewed mechanical translation wording.',
  );
}

if (
  !/\/api\/preferences\/language/.test(languageSync) ||
  !/saveLanguage\(/.test(languageSync) ||
  !/applyLanguage\(/.test(languageSync)
) {
  failures.push(
    'Wallet language persistence/restore behavior is no longer wired to the reviewed server-backed preference flow.',
  );
}

if (
  !/JWT_FUTURE_RETRY_DELAY_MS\s*=\s*750/.test(
    supabaseServer,
  ) ||
  !/RETRIABLE_READ_METHODS\s*=\s*new Set\(\[[\s\S]*'GET'[\s\S]*'HEAD'[\s\S]*\]\)/.test(
    supabaseServer,
  ) ||
  !/response\.clone\(\)\.text\(\)/.test(
    supabaseServer,
  ) ||
  !/body\.includes\('JWT issued at future'\)/.test(
    supabaseServer,
  ) ||
  !/RETRIABLE_READ_METHODS\.has\(method\)/.test(
    supabaseServer,
  ) ||
  !/await wait\(JWT_FUTURE_RETRY_DELAY_MS\)/.test(
    supabaseServer,
  )
) {
  failures.push(
    'Supabase transient JWT clock-skew recovery must remain a single delayed retry for exact GET/HEAD read failures.',
  );
}

const environmentGuardMentions =
  supabaseServer.match(
    /assertSafeDatabaseEnvironment\(\)/g,
  )?.length ?? 0;
if (environmentGuardMentions < 3) {
  failures.push(
    'Supabase environment safety must be checked before the initial request and before a transient retry.',
  );
}

if (failures.length > 0) {
  console.error('Final audit resilience gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Final audit resilience gate passed.');