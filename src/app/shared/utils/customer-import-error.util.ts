/**
 * O backend devolve mensagens de erro sempre em inglês (texto técnico da exceção) — nunca
 * mostrar isso diretamente ao utilizador. Mapeia os `errorCode` conhecidos (validação de linha
 * do preview e da importação assíncrona, issue #35 rework) para uma chave de tradução; para os
 * restantes, quem chama decide o fallback (mensagem genérica já traduzida, nunca o texto em
 * bruto do backend).
 *
 * Partilhado entre `CustomersComponent` (preview síncrona) e `CustomerImportDetailComponent`
 * (erros do job assíncrono) — as duas telas reportam os mesmos códigos de validação de linha.
 */
export const CUSTOMER_IMPORT_ERROR_CODE_KEY: Record<string, string> = {
  TAX_ID_ALREADY_EXISTS: 'customers.errors.taxIdAlreadyExists',
  TAX_ID_REQUIRED: 'customers.errors.taxIdRequired',
  TAX_ID_INVALID: 'errors.taxIdInvalid',
  CUSTOMER_NAME_REQUIRED: 'customers.errors.nameRequired',
  CUSTOMER_TYPE_INVALID: 'customers.errors.typeInvalid',
  CONTACT_NAME_REQUIRED: 'customers.errors.contactNameRequired',
  CONTACT_CHANNEL_REQUIRED: 'customers.errors.contactChannelRequired',
  CONTACT_WHATSAPP_OPT_IN_REQUIRES_PHONE: 'customers.errors.contactWhatsAppRequiresPhone',
  // Issue #234/G4: dependências abertas que recusam a desativação.
  CUSTOMER_HAS_OPEN_QUOTATION: 'customers.errors.hasOpenQuotation',
  CUSTOMER_HAS_OPEN_ORDER: 'customers.errors.hasOpenOrder',
  CUSTOMER_HAS_OPEN_INVOICE: 'customers.errors.hasOpenInvoice',
  IMPORT_FILE_EMPTY: 'customers.import.errors.empty',
  IMPORT_FILE_TOO_LARGE: 'customers.import.errors.tooLarge',
  IMPORT_FILE_TYPE_INVALID: 'customers.import.errors.typeInvalid',
  IMPORT_FILE_UNREADABLE: 'customers.import.errors.unreadable',
  IMPORT_HEADER_INVALID: 'customers.import.errors.headerInvalid',
  DUPLICATE_IN_FILE: 'customers.import.errors.duplicateInFile',
  IMPORT_ROW_FAILED: 'customers.import.errors.rowFailed',
};

export function customerImportErrorKey(errorCode: string | null | undefined): string | undefined {
  return errorCode ? CUSTOMER_IMPORT_ERROR_CODE_KEY[errorCode] : undefined;
}
