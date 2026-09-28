// 'info' está mapeado para o mesmo cinza de 'secondary' no preset do tema (app.config.ts) — não
// dá cor própria. 'primary' (verde-menta da marca) é a opção real quando "info" precisa destacar.
export type BadgeSeverity = 'primary' | 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';
