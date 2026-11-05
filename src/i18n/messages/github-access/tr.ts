/**
 * GitHub erişim ayarının (ortam değişkenleri) tanı mesajları: `github/access.ts`, `github/private-key.ts`, kurulum
 * hazırlığı. Ayrı küçük sözlük: bunlar her isteği karşılayan `proxy.ts`'in içe aktarma zincirinde; kurulum sihirbazının
 * büyük sözlüğü (`install`) oraya girmesin.
 */
const tr = {
  appIncomplete: 'GITHUB_APP_ID ve GITHUB_APP_PRIVATE_KEY birlikte tanımlanmalı (GitHub uygulamasıyla kurulum).',
  appIdNumber: 'GITHUB_APP_ID bir sayı olmalı (GitHub uygulamasının "App ID" değeri).',
  installationNumber: 'GITHUB_APP_INSTALLATION_ID bir sayı olmalı; bilmiyorsan boş bırak, sahibin kurulumu bulunur.',
  /** PEM anahtarı sorunu başa eklenir: "GITHUB_APP_PRIVATE_KEY: …". */
  privateKeyProblem: (reason: string) => `GITHUB_APP_PRIVATE_KEY: ${reason}`,
  missing: 'GitHub erişimi tanımlı değil: GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY (GitHub uygulaması) ya da GITHUB_TOKEN. Vercel → Settings → Environment Variables altına ekle (şablon: .env.example).',
  setupUnreadable: 'GitHub uygulamasının ayarları okunamadı.',
  /** Özel anahtar (PEM) biçimi (`github/private-key.ts`). */
  privateKey: 'GitHub uygulamasının özel anahtarı PEM biçiminde değil. GitHub’dan indirdiğin .pem dosyasının tamamını kullan.',
};

export default tr;
