import * as v from 'valibot';
import { DEFAULT_LOCALE, isLocale } from '../../i18n/locale.ts';
import { authMessages } from '../../i18n/messages/auth/index.ts';
import { msg } from '../../i18n/valibot.ts';
import { INVITE_CODE_LENGTH, PASSWORD_MAX_LENGTH } from '../client-status.ts';
import { passwordProblem } from '../password-rules.ts';

/**
 * Giriş şemaları — TEK kaynak.
 *
 * Aynı şema hem tarayıcıdaki formu (Formisch) hem sunucudaki ucu doğrular.
 * Tipler şemadan türetilir, elle tip yazılmaz: kural değişirse iki taraf da derlemede kırılır.
 */

export const OTP_LENGTH = 6;

export const emailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.email(msg((l) => authMessages(l).validation.email)),
  v.maxLength(200, msg((l) => authMessages(l).validation.emailTooLong)),
);

export const codeSchema = v.pipe(
  v.string(),
  v.trim(),
  v.regex(new RegExp(`^[0-9]{${OTP_LENGTH}}$`), msg((l) => authMessages(l).validation.code(OTP_LENGTH))),
);

/** Form: "giriş kodu gönder" adımı. */
export const requestCodeSchema = v.object({ email: emailSchema });
export type RequestCode = v.InferOutput<typeof requestCodeSchema>;

/** Form: kod doğrulama adımı. */
export const enterCodeSchema = v.object({ code: codeSchema });
export type EnterCode = v.InferOutput<typeof enterCodeSchema>;

/** Sunucu ucu: POST /api/auth/verify gövdesi. */
export const verifyBodySchema = v.object({ email: emailSchema, code: codeSchema });

/** Danışanın davet kodu: 8 hane; boşluk ve tire yok sayılır ("1234 5678"). */
export const joinSchema = v.object({
  code: v.pipe(
    v.string(),
    v.transform((value) => value.replace(/[\s-]/g, '')),
    v.regex(new RegExp(`^[0-9]{${INVITE_CODE_LENGTH}}$`), msg((l) => authMessages(l).validation.code(INVITE_CODE_LENGTH))),
  ),
});
export type JoinInput = v.InferOutput<typeof joinSchema>;

/**
 * Danışan şifresi (`password-rules.ts`: 8–128 karakter, yaygın ya da sıralı değil). Kırpılmaz: boşluk
 * da şifrenin parçası. Sunucu (`setClientPassword`) aynı kuralı yeniden uygular.
 */
export const passwordSchema = v.pipe(
  v.string(msg((l) => authMessages(l).password.required)),
  v.rawCheck(({ dataset, config, addIssue }) => {
    if (!dataset.typed) return;
    const problem = passwordProblem(dataset.value, isLocale(config.lang) ? config.lang : DEFAULT_LOCALE);
    if (problem) addIssue({ message: problem });
  }),
);

/** Form ve uç: şifre belirleme (kare koddan sonra ya da `/me`'deki kart). Tekrarı aynı olmalı. */
export const setPasswordSchema = v.pipe(
  v.object({ password: passwordSchema, confirm: v.string() }),
  v.forward(
    v.partialCheck([['password'], ['confirm']], (input) => input.password === input.confirm, msg((l) => authMessages(l).password.mismatch)),
    ['confirm'],
  ),
);
export type SetPasswordInput = v.InferOutput<typeof setPasswordSchema>;

/** Form: şifreyle giriş. Uzunluk burada denetlenmez: yanlış şifre de "yanlış" yanıtını alsın. */
export const passwordLoginSchema = v.object({
  password: v.pipe(
    v.string(),
    v.minLength(1, msg((l) => authMessages(l).password.required)),
    v.maxLength(PASSWORD_MAX_LENGTH, msg((l) => authMessages(l).password.tooLongInput)),
  ),
});
export type PasswordLoginInput = v.InferOutput<typeof passwordLoginSchema>;
