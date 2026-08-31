/**
 * The legal entity behind Starchild.
 *
 * Verified against the Czech ARES public register (IČO 19534001) on
 * 31 August 2026. These strings must match the contact information on the
 * AWS account and the AWS Activate application character for character —
 * including the acute accent in "Kilián".
 */
export const COMPANY = {
  /** Registered name exactly as written in the trade register. */
  legalName: "Kilián Valdman",

  /** The product / trading name. */
  tradeName: "Starchild",

  /** IČO — business registration number. */
  regNumber: "19534001",

  /** DIČ / VAT ID. Set to null if not VAT-registered. */
  vatId: "CZ0402075828" as string | null,

  /** Which register the entity is entered in. */
  register: "Živnostenský rejstřík (Czech Trade Licence Register)",

  /** Registered seat (místo podnikání), one line per array entry. */
  address: ["Rumunská 1828/10", "Nové Město", "120 00 Praha 2", "Česká republika"],

  /** Country, phrased for running prose. */
  countryLabel: "the Czech Republic",

  /** Founder's full legal name, as on the register entry. */
  founder: "Kilián Valdman",

  /** Year the entity began trading (register date: 17 July 2023). */
  founded: "2023",

  /** Must be a real mailbox on this domain — not a forwarder. */
  email: "hello@starchild.software",
} as const;

export const ADDRESS_INLINE = COMPANY.address.join(", ");
