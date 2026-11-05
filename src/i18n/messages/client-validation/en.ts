import type { Shape } from '../../define.ts';
import type tr from './tr.ts';

const en: Shape<typeof tr> = {
  clientId: 'Invalid client id.',
  number: 'Must be a number.',
  integer: 'Must be a whole number.',
  atLeast: (min: number) => `Must be at least ${min}.`,
  atMost: (max: number) => `Must be at most ${max}.`,
  nameRequired: 'Enter a name.',
  nameShort: 'Name is too short.',
  maxChars: (max: number) => `At most ${max} characters.`,
  pickExperience: 'Choose the training history.',
  digitsOnly: 'Digits only.',
  heartPair: 'Enter both or leave both empty.',
  heartOrder: 'The recovery limit must be lower than the alert limit.',
  pickStatus: 'Choose a status.',
  pickHealthPart: 'Choose at least one part when the module is on.',
};

export default en;
