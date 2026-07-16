/**
 * @formflowjs/core — framework-agnostic engine for FormFlow.
 *
 * Public surface: schema/value/result TYPES, the load-bearing CONSTANTS and
 * their helpers, conditional-visibility logic, file rules, client-side
 * VALIDATION (parity with the Strapi plugin), typed ERRORS, payload
 * SERIALIZATION, the content-API CLIENT, and the reactive form STORE.
 *
 * This package imports NO framework (no react/vue) and is SSR/RSC-safe: it never
 * touches `window`/`document` at module top level. The React and Vue adapters
 * are thin bindings over the {@link createFormStore} state container exported
 * here.
 */

/* ---- types ---- */
export type {
  // field types
  FieldTypeName,
  FieldTypeCategory,
  FieldTier,
  FieldWidth,
  FieldTypeDefinition,
  FieldOption,
  // validation rules
  ValidationRule,
  ValidationRuleType,
  // conditional
  ConditionalOperator,
  ConditionalRule,
  // form schema
  FormField,
  FormLayout,
  FormStep,
  PublicRecaptchaConfig,
  PublicSpamConfig,
  FormSettings,
  FormSchema,
  // values / errors / results
  FormValues,
  FormErrors,
  ValidationResult,
  SubmitSuccess,
  StepValidationSuccess,
  PartialSaveResult,
  PartialResumeResult,
  // captcha
  CaptchaProvider,
  CaptchaConfig,
  CaptchaTokens,
  // files
  UploadedFileMeta,
} from './types';

/* ---- constants + helpers ---- */
export {
  DEFAULT_API_PREFIX,
  STEP_INDICATOR_FIELD,
  RESUME_TOKEN_FIELD,
  DEFAULT_HONEYPOT_FIELD,
  CAPTCHA_TOKEN_FIELD,
  RECAPTCHA_ALT_TOKEN_FIELD,
  LAYOUT_FIELD_TYPES,
  CHOICE_FIELD_TYPES,
  MULTI_VALUE_FIELD_TYPES,
  DEFAULT_VALUE_FIELD_TYPES,
  PRO_FIELD_TYPES,
  BUSINESS_FIELD_TYPES,
  CONDITIONAL_OPERATORS,
  VALUELESS_OPERATORS,
  isLayoutField,
  isChoiceField,
  isMultiValueField,
  isProFieldType,
  fieldTierForType,
} from './constants';

/* ---- conditional logic ---- */
export {
  isEmptyValue,
  evaluateConditional,
  isFieldVisible,
  partitionFieldsByVisibility,
} from './conditional';

/* ---- file rules ---- */
export {
  getFileInfo,
  isFile,
  isFileTypeAllowed,
  validateFile,
  type FileLike,
} from './file-rules';

/* ---- validation (parity with the server) ---- */
export {
  isEmpty,
  coerceBoolean,
  runValidationRule,
  validateFieldType,
  validateFieldOptions,
  validateFields,
  validateFiles,
  validateSubset,
  validateForm,
} from './validation';

/* ---- errors ---- */
export {
  FormFlowError,
  isFormFlowError,
  parseApiError,
  type FormFlowErrorCode,
  type FormFlowErrorInit,
} from './errors';

/* ---- serialize ---- */
export {
  buildSubmitData,
  type BuildSubmitDataExtras,
  type SubmitData,
} from './serialize';

/* ---- client ---- */
export {
  createFormFlowClient,
  type FormFlowClient,
  type FormFlowClientOptions,
  type GetFormOptions,
  type SubmitPayload,
  type SubmitOptions,
  type PartialOptions,
} from './client';

/* ---- store ---- */
export {
  createFormStore,
  type FormFlowStore,
  type FormFlowState,
  type FormStoreOptions,
  type ValidateOn,
  type RevalidateOn,
} from './store';
