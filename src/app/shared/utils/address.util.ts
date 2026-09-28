import { AddressValue } from '../components/address-autocomplete/address-autocomplete.component';

/** Flat address fields the backend APIs (tenant + freelancer) expect. */
export interface AddressFields {
  address?: string;
  addressComplement?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

/** Maps the address autocomplete's structured value to the flat fields the API expects. */
export function addressValueToFields(a: AddressValue | null | undefined): AddressFields {
  return {
    address: a?.street ?? undefined,
    addressComplement: a?.complement ?? undefined,
    postalCode: a?.postalCode ?? undefined,
    city: a?.city ?? undefined,
    country: a?.country ?? undefined,
    latitude: a?.latitude ?? undefined,
    longitude: a?.longitude ?? undefined,
  };
}
