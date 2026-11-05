/**
 * Giriş: danışanın kare kodla katılımı (`/join`), şifreyle girişi (`/giris`), antrenör girişi (`/login`), şifre
 * kuralları, giriş uçlarının mesajları (`client-auth-routes.ts`, `api/auth`) ve giriş kodu e-postası.
 */
const tr = {
  /** Şifre kuralları (`password-rules.ts`) ve şifre alanlarının mesajları (`schemas/auth.ts`). */
  password: {
    tooShort: (min: number) => `Şifre en az ${min} karakter olmalı.`,
    tooLong: (max: number) => `Şifre en fazla ${max} karakter olabilir.`,
    common: 'Bu şifre çok yaygın, kolay tahmin edilir. Başka bir şifre seç.',
    trivial: 'Şifre sıralı ya da tekrarlanan karakterlerden oluşamaz.',
    required: 'Şifreni yaz.',
    tooLongInput: 'Şifre çok uzun.',
    mismatch: 'Şifreler aynı değil.',
  },
  /** Form alanı doğrulama mesajları (`schemas/auth.ts`). */
  validation: {
    email: 'Geçerli bir e-posta adresi yaz.',
    emailTooLong: 'E-posta adresi çok uzun.',
    code: (length: number) => `${length} haneli kodu gir.`,
  },
  /** Giriş uçlarının yanıtları (`lib/client-auth-routes.ts`). */
  routes: {
    foreignOrigin: 'Bu istek bu siteden gelmedi.',
    jsonRequired: 'İstek JSON olmalı.',
    unavailable: 'Şu an giriş yapılamıyor. Biraz sonra tekrar dene.',
    invalidRequest: 'İstek geçersiz.',
    codeLength: (length: number) => `Kod ${length} haneli olmalı.`,
    /** Kare kodla giriş reddedilince (nedene göre); `none` bilinmeyen kimlik ve davetsiz danışan için de. */
    join: {
      invalid: 'Kod yanlış. Antrenörünün verdiği kodu kontrol et.',
      locked: 'Çok fazla yanlış deneme oldu. Antrenöründen yeni bir kare kod iste.',
      used: 'Bu kod daha önce kullanılmış. Şifren varsa şifreyle gir; yoksa antrenöründen yeni bir kare kod iste.',
      expired: 'Kodun süresi dolmuş. Antrenöründen yeni bir kare kod iste.',
      none: 'Geçerli bir davet bulunamadı. Antrenöründen yeni bir kare kod iste.',
      archived: 'Bu hesap kapalı. Antrenörünle görüş.',
    },
    loginDenied: 'Şifre yanlış ya da hesap kısa süreliğine kilitli.',
    passwordRequired: 'Şifreni yaz.',
    sessionClosed: 'Oturumun kapanmış. Yeniden giriş yap.',
    sessionEnded: 'Oturumun kapanmış. Antrenöründen yeni bir kare kod iste.',
    passwordNotAllowed: 'Bu oturumda şifre belirlenemez. Şifreni değiştirmek için antrenöründen yeni bir kare kod iste.',
    passwordNotSaved: 'Şifre kaydedilemedi. Biraz sonra tekrar dene.',
  },
  /** `/giris` ekranının bilgi satırları (`giris/login-screen.ts`). */
  loginScreen: {
    loggedOutNotice: 'Çıkış yaptın. Tekrar girmek için şifreni yaz.',
    noPasswordTitle: 'Çıkış yaptın',
    noPasswordNotice: 'Bu hesabın şifresi yok; tekrar girmek için antrenöründen yeni bir kare kod iste.',
  },
  /** Danışanın şifreyle girişi (`/giris`). */
  login: {
    title: 'Giriş',
    welcomeBack: 'Tekrar hoş geldin.',
    openLinkTitle: 'Bağlantını aç',
    openLinkBody: 'Antrenöründen aldığın bağlantıyı aç ya da yeni bir kare kod iste.',
    passwordLabel: 'Şifre',
    submit: 'Giriş yap',
    forgot: 'Şifreni unuttun mu? Antrenörüne söyle, yeni kare kod versin.',
    trainerPrompt: 'Antrenör müsün?',
    trainerLink: 'Buradan gir',
  },
  /** Şifre kutusu ve şifre belirleme formu (`giris/password-input.tsx`, `set-password-form.tsx`). */
  passwordField: {
    showLabel: 'Şifreyi göster',
    show: 'Göster',
    hide: 'Gizle',
    label: 'Şifre',
    confirmLabel: 'Şifre (tekrar)',
    hint: (min: number) =>
      `En az ${min} karakter; 12345678 gibi yaygın ya da sıralı şifre olmaz. Unutursan antrenörün yeni kare kod verir.`,
  },
  /** Kare kodla katılım (`/join`). */
  join: {
    title: 'Katıl',
    sessionClosed: 'Oturumun kapandı. Antrenöründen yeni bir kare kod iste.',
    failed: 'Giriş yapılamadı.',
    brokenLink: 'Bağlantı bozuk. Kare kodu yeniden okut.',
    welcome: 'Antrenmanına hoş geldin.',
    stepLabel: (step: number, total: number) => `Adım ${step} / ${total}`,
    confirmTitle: 'Kodunu onayla',
    confirmBody: 'Kare koddan geldiysen kod hazır. Sonra şifreni belirleyip uygulamayı ana ekrana ekleyeceksin.',
    scanTitle: 'Kare kodu okut',
    scanBody: 'Antrenörünün gösterdiği kare kodu telefonunun kamerasıyla okut ya da gönderdiği bağlantıyı aç.',
    codeLabel: 'Davet kodu',
    codeHint: (length: number) => `Antrenörünün verdiği ${length} haneli kod. Bir kez kullanılır.`,
    continue: 'Devam',
    haveAccount: 'Zaten hesabın var mı?',
    passwordLogin: 'Şifreyle gir',
    passwordStep: {
      title: 'Şifreni belirle',
      body: 'Bir dahaki sefere bu telefonda ya da başka bir telefonda şifrenle girersin.',
      submit: 'Şifreyi kaydet ve devam et',
      installTitle: 'Uygulamayı ana ekrana ekle',
      installedBody: 'Uygulama yüklendi. Programın bundan sonra ana ekrandaki simgeden açılır.',
      savedBody: 'Şifren kaydedildi. Programın ana ekrandaki simgeden, tarayıcı çubuğu olmadan tam ekran açılsın.',
    },
  },
  /** Antrenör girişi (`/login`). */
  trainer: {
    tagline: 'Güçlü antrenman. Akıllı koçluk.',
    /** `?error=` kodları (GitHub dönüşü). */
    errors: {
      yetkisiz: 'Bu GitHub hesabı uygulamanın sahibi değil.',
      iptal: 'GitHub girişi yarıda kaldı.',
      oturum_suresi: 'Giriş isteğinin süresi doldu. Tekrar dene.',
      github_hatasi: 'GitHub ile bağlantı kurulamadı. Tekrar dene.',
      github_kapali: 'GitHub girişi bu kurulumda yapılandırılmamış.',
      kod_yok: 'GitHub yetki kodu gelmedi. Tekrar dene.',
    },
    failed: 'Giriş yapılamadı.',
    github: 'GitHub ile devam et',
    githubHint: 'Antrenör girişi. Uygulamanın sahibi olan hesapla açılır.',
    /** İki ortam değişkeninin adı arasına girer (adlar `<code>` ile yazılır): önce + ad + arası + ad + sonra. */
    githubMissing: { before: 'GitHub girişi için ', between: ' ve ', after: ' tanımlanmalı.' },
    fallback: 'yedek yol',
    clientHint: 'Danışansan antrenörünün verdiği kare kodu kullan.',
    emailLabel: 'E-posta adresi',
    emailPlaceholder: 'ornek@eposta.com',
    sendCode: 'Giriş kodu gönder',
    sending: 'Gönderiliyor…',
    codeSent: 'Giriş kodu gönderildi.',
    codeValidity: 'Kod 5 dakika geçerli, tek kullanımlık.',
    codeLabel: (email: string, length: number) => `${email} adresine gönderilen ${length} haneli kod`,
    verify: 'Giriş yap',
    verifying: 'Kontrol ediliyor…',
    changeEmail: 'Adresi değiştir',
  },
  /** `api/auth/*` yanıtları. */
  api: {
    codeFailed: 'Kod hatalı ya da süresi doldu. Gerekirse yeni kod iste.',
    unavailable: 'Şu an giriş yapılamıyor. Biraz sonra tekrar dene.',
  },
  /** Giriş kodu e-postası (`lib/mail.ts`). */
  mail: {
    subject: (code: string) => `Giriş kodun: ${code}`,
    body: (code: string) =>
      `Giriş kodun: ${code}\n\nKod 5 dakika geçerli ve tek kullanımlıktır. Bu isteği sen yapmadıysan yok sayabilirsin.`,
  },
};

export default tr;
