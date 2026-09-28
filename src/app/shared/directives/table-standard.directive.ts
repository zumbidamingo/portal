import { Directive, OnInit, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Table } from 'primeng/table';

/**
 * Padrão único de UX/UI para toda `p-table` do portal: paginação, contagem total via rodapé
 * de página e hover de linha. `rows`/`sortField`/`lazy`/`totalRecords` continuam por tabela —
 * dependem do volume e da fonte de dados de cada uma.
 */
@Directive({ selector: 'p-table[appTableStandard]', standalone: true })
export class TableStandardDirective implements OnInit {
  private table = inject(Table);
  private translate = inject(TranslateService);

  ngOnInit(): void {
    this.table.paginator = true;
    this.table.rowHover = true;
    this.table.showCurrentPageReport = true;
    this.table.currentPageReportTemplate = this.translate.instant('common.pageReport');
  }
}
