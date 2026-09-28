import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { IntelligenceService } from './intelligence.service';
import { canAccessRoute } from '../auth/route-access';

describe('IntelligenceService', () => {
  let service: IntelligenceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(IntelligenceService);
    http = TestBed.inject(HttpTestingController);
  });

  it('asks the backend for the approval queue by status, paged', () => {
    service.listDecisions('PENDING_APPROVAL', 0, 50).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/intelligence/decisions'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('status')).toBe('PENDING_APPROVAL');
    expect(req.request.params.get('size')).toBe('50');
    req.flush({ content: [], page: { totalElements: 0, totalPages: 0, number: 0, size: 50 } });
  });

  it('omits the status filter when listing the whole history', () => {
    service.listDecisions(null).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/intelligence/decisions'));
    expect(req.request.params.has('status')).toBe(false);
    req.flush({ content: [], page: { totalElements: 0, totalPages: 0, number: 0, size: 20 } });
  });

  it('approving and rejecting are POSTs on the decision, with no tenant anywhere in the request', () => {
    service.approve('d-1').subscribe();
    const approve = http.expectOne(r => r.url.endsWith('/intelligence/decisions/d-1/approve'));
    expect(approve.request.method).toBe('POST');
    expect(approve.request.body).toEqual({});
    approve.flush({});

    service.reject('d-2').subscribe();
    const reject = http.expectOne(r => r.url.endsWith('/intelligence/decisions/d-2/reject'));
    expect(reject.request.method).toBe('POST');
    reject.flush({});
  });

  it('saves a policy per action type with the risk and the explicit auto-execute consent', () => {
    service.setPolicy('CHANGE_SERVICE_PRICE', 'HIGH', true).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/intelligence/policies/CHANGE_SERVICE_PRICE'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ riskLevel: 'HIGH', autoExecute: true });
    req.flush({});
  });
});

describe('intelligence route access', () => {
  it('opens for the roles the backend lets read the decision queue', () => {
    for (const role of ['OWNER', 'ADMIN', 'OPERATOR', 'COMMERCIAL'] as const) {
      expect(canAccessRoute('/intelligence', role)).toBe(true);
    }
  });

  it('stays closed for finance and field roles', () => {
    for (const role of ['FINANCE', 'TECHNICIAN', 'LAUNDRY'] as const) {
      expect(canAccessRoute('/intelligence', role)).toBe(false);
    }
  });
});
