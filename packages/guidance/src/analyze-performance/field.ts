/** Decides where a page's field data comes from, and fetches it from the CrUX API when a key is set. */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { type CruxFile, CruxRecordSchema, FORM_FACTORS, type ManifestPage } from './schemas.ts';

/** Decides where the page's field data comes from, calling the CrUX API when a key is set and the page is public. */
export async function collectField(
  url: string,
  slug: string,
  isPrivate: boolean,
  psi: PsiRuns,
  out: string,
  cruxKey: string | undefined,
  dependencies: { fetchJson: FetchJson },
): Promise<Pick<ManifestPage, 'crux' | 'fieldSource' | 'fieldUnavailableReason' | 'psiField'>> {
  const crux: Record<FormFactor, string | null> = { desktop: null, mobile: null };
  const psiField = { desktop: psi.desktop.fieldFile, mobile: psi.mobile.fieldFile };
  if (isPrivate) {
    return {
      crux,
      psiField,
      fieldSource: null,
      fieldUnavailableReason: 'the URL is private, so CrUX has no data for it',
    };
  }
  const hasPsiField = FORM_FACTORS.some((formFactor) => psiField[formFactor] !== null);
  if (cruxKey !== undefined) {
    const errors: string[] = [];
    for (const formFactor of FORM_FACTORS) {
      try {
        const file = await fetchCrux(url, formFactor, cruxKey, dependencies);
        const relative = path.join(slug, `crux-${formFactor}.json`);
        writeFileSync(path.join(out, relative), `${JSON.stringify(file, null, 2)}\n`, 'utf8');
        crux[formFactor] = relative;
      } catch (error) {
        errors.push(`${formFactor}: ${describeError(error)}`);
      }
    }
    if (errors.length === 0) return { crux, psiField, fieldSource: 'crux-api', fieldUnavailableReason: null };
    return {
      crux,
      psiField,
      fieldSource: hasPsiField ? 'psi' : null,
      fieldUnavailableReason: `CrUX API failed (${errors.join('; ')})`,
    };
  }
  const unmeasured = FORM_FACTORS.filter((formFactor) => !psi[formFactor].measured);
  if (!hasPsiField) {
    const fieldUnavailableReason =
      unmeasured.length === FORM_FACTORS.length
        ? `PSI did not measure the page and ${CRUX_KEY_VARIABLE} is not set`
        : 'CrUX has too little traffic for the URL and its origin';
    return { crux, psiField, fieldSource: null, fieldUnavailableReason };
  }
  return {
    crux,
    psiField,
    fieldSource: 'psi',
    fieldUnavailableReason:
      unmeasured.length === 0
        ? null
        : `PSI did not measure the ${unmeasured.join(' and ')} form factor and ${CRUX_KEY_VARIABLE} is not set`,
  };
}

/** The environment variable that holds the CrUX API key, the one credential that the helper reads. */
export const CRUX_KEY_VARIABLE = 'CRUX_API_KEY';

/** Fetches a URL and resolves with its status and parsed JSON body, rejecting when the request does not complete. */
export type FetchJson = (
  url: string,
  init?: { body: string; method: 'POST' },
) => Promise<{ status: number; body: unknown }>;

/** What a page's PSI runs yielded in each form factor: whether any run succeeded, and the first one with field data. */
export type PsiRuns = Record<FormFactor, { measured: boolean; fieldFile: string | null }>;

/** Reads the message of a Google API error body, or the body itself when it is text. */
export function readErrorMessage(body: unknown): string {
  if (typeof body === 'string') return body.slice(0, 200);
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const error = body.error;
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      return error.message;
    }
  }
  return 'unrecognized error body';
}

const CRUX_ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';

const CRUX_FORM_FACTORS: Readonly<Record<FormFactor, string>> = { desktop: 'DESKTOP', mobile: 'PHONE' };

// region | Helpers

type FormFactor = (typeof FORM_FACTORS)[number];

/** Queries the CrUX API for the URL and its origin; a 404 means too little traffic and yields a null record. */
async function fetchCrux(
  url: string,
  formFactor: FormFactor,
  key: string,
  dependencies: { fetchJson: FetchJson },
): Promise<CruxFile> {
  return {
    url: await queryCrux({ url }, formFactor, key, dependencies),
    origin: await queryCrux({ origin: new URL(url).origin }, formFactor, key, dependencies),
  };
}

/** Queries one CrUX API record, returning null on the 404 by which the API reports too little traffic. */
async function queryCrux(
  target: { origin: string } | { url: string },
  formFactor: FormFactor,
  key: string,
  dependencies: { fetchJson: FetchJson },
): Promise<CruxFile['url']> {
  const body = JSON.stringify({ ...target, formFactor: CRUX_FORM_FACTORS[formFactor] });
  const response = await dependencies.fetchJson(`${CRUX_ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    body,
  });
  if (response.status === 404) return null;
  if (response.status !== 200) throw new Error(`HTTP ${response.status}: ${readErrorMessage(response.body)}`);
  return CruxRecordSchema.parse(response.body);
}

// endregion | Helpers
