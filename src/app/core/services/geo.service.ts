import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  postalCode?: string;
}

export interface AddressSuggestion {
  displayName: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

@Injectable({ providedIn: 'root' })
export class GeoService {
  private http = inject(HttpClient);

  getCurrentPosition(): Observable<GeolocationPosition> {
    return from(
      new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject)
      )
    );
  }

  geocodeAddress(address: string): Observable<GeocodingResult | null> {
    const url = `${environment.apiUrl}/geocode?address=${encodeURIComponent(address)}`;
    return this.http.get<GeocodingResult>(url).pipe(
      catchError(() => of(null))
    );
  }

  searchAddresses(query: string): Observable<AddressSuggestion[]> {
    const url = `${environment.apiUrl}/geocode/search?q=${encodeURIComponent(query)}`;
    return this.http.get<AddressSuggestion[]>(url).pipe(
      catchError(() => of([]))
    );
  }

  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
