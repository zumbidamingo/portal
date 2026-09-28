import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { TenantUnitsComponent } from '../../tenant-units/tenant-units.component';

@Component({
  selector: 'app-units-page',
  standalone: true,
  imports: [TranslatePipe, PageHeaderComponent, TenantUnitsComponent],
  template: `
    <app-page-header [title]="'profile.tabUnits' | translate" [description]="'administration.cards.unitsDesc' | translate"
                     [breadcrumb]="[{ label: 'nav.administration' | translate, route: '/administration' }]"></app-page-header>
    <app-tenant-units></app-tenant-units>
  `,
})
export class UnitsPageComponent {}
